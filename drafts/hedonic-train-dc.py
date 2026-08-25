#!/usr/bin/env python3
"""
TerraValue fitted-AVM trainer — DC market (Gate 1, 2026-07-15).

Trains the shipping ridge hedonic and exports a JSON coefficient artifact the
engine's FittedValuation module scores with. Deterministic: same CSV in, same
artifact out.

Recipe (frozen 2026-07-15 after the regressivity lab; see
hedonic-regressivity-lab.py / hedonic-h5.py / hedonic-h6.py for the ladder):
  - Ridge hedonic (lambda=1.0) on log price, train = sales <= 2024.
  - Features: prototype set + ordinal-grade terms (rare grades no longer
    collapse to baseline; dummy min_n=10), log-GBA curvature, luxury
    interactions (top-grade x {lot, size, baths}, grade x condition).
  - Vertical-equity tilt: gamma fit to ZERO PRB on a 2024 pseudo-holdout
    (model refit on <=2023) — temporal, honest, never sees 2025+.
  - Grade-band quarterly $/sqf carry index (shrunk to citywide, k=60) for
    valuation dates after the anchor quarter.

Holdout (2025+) result at freeze: med 0.964 COD 10.5 PRD 1.020 PRB -0.015
(IAAO extreme-ratio trim, 3.9%); untrimmed med 0.965 COD 12.4 PRD 1.039
PRB -0.040 (all but PRD).

Usage:
  python3 hedonic-train-dc.py <sales_csv> <artifact_out.json> <pred_out.csv>
"""
import csv, json, math, sys
from collections import defaultdict

import numpy as np

MARKET = 'dc'
ARTIFACT_VERSION = '1.0.0'
LAMBDA = 1.0
TRAIN_THROUGH = '2024'          # last full training year
ANCHOR = '2024Q4'               # quarter all predictions are expressed in
TILT_FIT_THROUGH = '2023'       # tilt refit cutoff (pseudo-holdout = 2024)
TILT_ANCHOR = '2023Q4'
K_SHRINK = 60                   # band-index shrinkage toward citywide
GRADE_MIN_N = 10
DUMMY_MIN_N = 25
CELL_DEG = 0.008                # ~0.9 km grid

COND = {'Poor': 1, 'Fair': 2, 'Average': 3, 'Good': 4, 'Very Good': 5, 'Excellent': 6}
GRADES = ['Low Quality', 'Fair Quality', 'Average', 'Above Average', 'Good Quality',
          'Very Good', 'Excellent', 'Superior', 'Exceptional-A', 'Exceptional-B',
          'Exceptional-C', 'Exceptional-D']
GIX = {g: i for i, g in enumerate(GRADES)}


def load(path):
    rows = []
    for r in csv.DictReader(open(path)):
        try:
            if not r['gba'] or float(r['gba']) <= 0:
                continue
            if not r['sale_price'] or float(r['sale_price']) <= 0:
                continue
            rows.append(dict(
                ssl=r['ssl'], sale_date=r['sale_date'], yr=r['sale_date'][:4],
                q=r['sale_date'][:4] + 'Q' + str((int(r['sale_date'][5:7]) - 1) // 3 + 1),
                price=float(r['sale_price']), gba=float(r['gba']),
                land=float(r['landarea'] or 0),
                ayb=float(r['ayb'] or 0), eyb=float(r['eyb'] or 0),
                rmdl=float(r['yr_rmdl'] or 0),
                bed=float(r['bedrm'] or 0), bath=float(r['bathrm'] or 0),
                hbath=float(r['hf_bathrm'] or 0), rooms=float(r['rooms'] or 0),
                stories=float(r['stories'] or 0), units=float(r['num_units'] or 1),
                ac=1.0 if r['ac'] == 'Y' else 0.0, fp=float(r['fireplaces'] or 0),
                cond=COND.get(r['condition'], 3), gix=GIX.get(r['grade'], 2),
                cell=f"{int(float(r['lat']) // CELL_DEG)}:{int(float(r['lon']) // CELL_DEG)}",
                ward=r['ward'], usecode=r['usecode']))
        except ValueError:
            continue
    return rows


def vocab(key, items, min_n):
    c = defaultdict(int)
    for r in items:
        c[r[key]] += 1
    return {str(v): i for i, v in
            enumerate(sorted((k for k, n in c.items() if n >= min_n), key=str))}


def band(gix):
    return 0 if gix <= 3 else (1 if gix <= 5 else 2)


class Spec:
    """Feature spec + design row. Mirrored exactly by lib/fitted-valuation.js."""

    def __init__(self, train):
        self.grades = vocab('gix', train, GRADE_MIN_N)
        self.conds = vocab('cond', train, DUMMY_MIN_N)
        self.uses = vocab('usecode', train, DUMMY_MIN_N)
        self.qs = vocab('q', train, 5)
        self.wards = vocab('ward', train, 5)
        self.cells = vocab('cell', train, DUMMY_MIN_N)

    def design(self, r, q_override=None):
        q = q_override or r['q']
        lg = math.log(r['gba'])
        g = r['gix'] / 11.0
        hi = 1.0 if r['gix'] >= 6 else 0.0
        x = [1.0, lg, math.log(r['land'] + 1), r['bed'], r['bath'], r['hbath'],
             r['rooms'], r['stories'], r['ac'], r['fp'], min(r['units'], 4),
             (2026 - r['ayb']) / 100 if r['ayb'] > 1800 else 1.0,
             (2026 - r['eyb']) / 100 if r['eyb'] > 1800 else 0.5,
             1.0 if r['rmdl'] >= 2010 else 0.0,
             1.0 if 1990 <= r['rmdl'] < 2010 else 0.0,
             g, g * g, g * (lg - 7.0),
             (lg - 7.0) ** 2,
             hi * math.log(r['land'] + 1), hi * (lg - 7.0), hi * r['bath'],
             g * (r['cond'] - 3.0)]
        for vb, val in ((self.grades, r['gix']), (self.conds, r['cond']),
                        (self.uses, r['usecode']), (self.qs, q), (self.wards, r['ward'])):
            v = [0.0] * len(vb)
            k = str(val)
            if k in vb:
                v[vb[k]] = 1.0
            x += v
        v = [0.0] * len(self.cells)
        if r['cell'] in self.cells:
            v[self.cells[r['cell']]] = 1.0
        x += v
        return x


def fit_ridge(spec, rows, lam=LAMBDA):
    X = np.array([spec.design(r) for r in rows])
    y = np.log(np.array([r['price'] for r in rows]))
    return np.linalg.solve(X.T @ X + lam * np.eye(X.shape[1]), X.T @ y)


def prb_of(pred, sp):
    r = pred / sp
    m = float(np.median(r))
    vp = 0.5 * (sp + pred / m)
    x = np.log(vp) / math.log(2)
    y = r / m - 1
    xc = x - x.mean()
    return float((xc * (y - y.mean())).sum() / (xc ** 2).sum())


def build_carry(rows):
    """carry[band][q] = shrunk band median $/sqf. Returned raw (not anchored);
    scorer divides by the anchor value."""
    all_q, band_q = defaultdict(list), defaultdict(list)
    for r in rows:
        v = r['price'] / r['gba']
        all_q[r['q']].append(v)
        band_q[(band(r['gix']), r['q'])].append(v)
    city = {q: float(np.median(v)) for q, v in all_q.items() if len(v) >= 50}
    out = {}
    for b in (0, 1, 2):
        t = {}
        for q, cw in city.items():
            vs = band_q.get((b, q), [])
            if len(vs) < 5:
                t[q] = cw
            else:
                w = len(vs) / (len(vs) + K_SHRINK)
                t[q] = math.exp(w * math.log(float(np.median(vs))) + (1 - w) * math.log(cw))
        out[str(b)] = t
    return out


def carry_factor(carry, gix, q, anchor=ANCHOR):
    t = carry[str(band(gix))]
    ref = t[anchor]
    return (t.get(q) or ref) / ref


def fit_tilt(logpred, sp):
    c = float(np.median(logpred))
    lo, hi = -0.05, 0.60
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if prb_of(np.exp(logpred + mid * (logpred - c)), sp) < 0.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi), c


def iaao(pred, sp):
    r = pred / sp
    m = float(np.median(r))
    cod = 100 * float(np.mean(np.abs(r - m))) / m
    prd = float(np.mean(r)) / (pred.sum() / sp.sum())
    mdape = 100 * float(np.median(np.abs(pred - sp) / sp))
    return dict(n=int(len(sp)), median_ratio=round(m, 4), cod=round(cod, 2),
                prd=round(prd, 4), prb=round(prb_of(pred, sp), 4), mdape=round(mdape, 2))


def trim_mask(pred, sp):
    r = np.log(pred / sp)
    q1, q3 = np.quantile(r, [0.25, 0.75])
    iqr = q3 - q1
    return (r >= q1 - 1.5 * iqr) & (r <= q3 + 1.5 * iqr)


def main():
    sales_csv, artifact_out, pred_out = sys.argv[1:4]
    rows = load(sales_csv)
    train = [r for r in rows if r['yr'] <= TRAIN_THROUGH]
    test = [r for r in rows if r['yr'] > TRAIN_THROUGH]
    carry = build_carry(rows)

    # 1) tilt from temporal pseudo-holdout (never sees anything past TRAIN_THROUGH)
    tr_t = [r for r in train if r['yr'] <= TILT_FIT_THROUGH]
    val = [r for r in train if r['yr'] > TILT_FIT_THROUGH]
    spec_t = Spec(tr_t)
    beta_t = fit_ridge(spec_t, tr_t)
    Xv = np.array([spec_t.design(r, q_override=TILT_ANCHOR) for r in val])
    cf = np.array([carry_factor(carry, r['gix'], r['q'], anchor=TILT_ANCHOR) for r in val])
    lp_val = Xv @ beta_t + np.log(cf)
    gamma, center = fit_tilt(lp_val, np.array([r['price'] for r in val]))
    print(f"tilt: gamma={gamma:.4f} center={center:.4f} "
          f"(pseudo-holdout n={len(val):,}, PRB pre-tilt "
          f"{prb_of(np.exp(lp_val), np.array([r['price'] for r in val])):+.3f})")

    # 2) final model on all train
    spec = Spec(train)
    beta = fit_ridge(spec, train)

    # 3) holdout predictions (the artifact's validation block + harness CSV)
    Xt = np.array([spec.design(r, q_override=ANCHOR) for r in test])
    lp = Xt @ beta
    lp = lp + gamma * (lp - center)
    cf = np.array([carry_factor(carry, r['gix'], r['q']) for r in test])
    pred = np.exp(lp) * cf
    sp = np.array([r['price'] for r in test])
    untrimmed = iaao(pred, sp)
    keep = trim_mask(pred, sp)
    trimmed = iaao(pred[keep], sp[keep])
    print('holdout untrimmed:', untrimmed)
    print(f"holdout trimmed ({int((~keep).sum())} removed):", trimmed)

    # 4) artifact
    artifact = {
        'artifact': 'terravalue-fitted-avm',
        'market': MARKET,
        'version': ARTIFACT_VERSION,
        'trained': '2026-07-15',
        'estimator': 'ridge-hedonic-log',
        'lambda': LAMBDA,
        'train_through': TRAIN_THROUGH,
        'anchor_quarter': ANCHOR,
        'n_train': len(train),
        'tilt': {'gamma': gamma, 'center': center,
                 'method': f'zero-PRB on {int(TILT_FIT_THROUGH)+1} pseudo-holdout (refit <= {TILT_FIT_THROUGH})'},
        'cell_deg': CELL_DEG,
        'vocab': {'grades': spec.grades, 'conds': spec.conds, 'uses': spec.uses,
                  'quarters': spec.qs, 'wards': spec.wards, 'cells': spec.cells},
        'beta': [float(b) for b in beta],
        'carry': {b: {q: round(v, 4) for q, v in t.items()} for b, t in carry.items()},
        'validation': {'holdout': '2025+', 'untrimmed': untrimmed, 'trimmed': trimmed,
                       'trim_rule': 'IAAO extreme-ratio, 1.5*IQR of ln ratios'},
    }
    with open(artifact_out, 'w') as f:
        json.dump(artifact, f)
    print(f"wrote {artifact_out} ({len(artifact['beta'])} coefficients)")

    # 5) predictions CSV for the ratio-study harness
    with open(pred_out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['ssl', 'sale_date', 'sale_price', 'predicted'])
        for r, p in zip(test, pred):
            w.writerow([r['ssl'], r['sale_date'], f"{r['price']:.0f}", f"{p:.2f}"])
    print(f"wrote {pred_out} (n={len(test):,})")


if __name__ == '__main__':
    main()
