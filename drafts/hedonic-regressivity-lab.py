#!/usr/bin/env python3
"""
Hedonic regressivity lab — DC (Gate 1, 2026-07-15).
Goal: take the diagnostic hedonic (COD 12.7 ✅, PRD/PRB ❌, >$2M med ratio 0.864)
and find the minimal rung ladder that passes ALL FOUR IAAO gates on the 2025+
temporal holdout, without breaking COD.

Rungs (cumulative unless noted):
  H0  prototype as-is (replication check vs deep-dive numbers)
  H1  grade fix: ordinal gix continuous + dummy min_n 25->10 (rare grades no
      longer collapse to baseline)
  H2  + curvature/interactions: log(gba)^2, gix*log(gba), gix ordinal^2
  H3  + lighter ridge on high-signal terms (single lambda sweep reported)
  H4  + cross-fitted monotone tier calibration (5-fold OOF on train; piecewise
      linear in log(pred), applied at scoring)

Output: IAAO metrics per rung on 2025+ holdout + per-price-tier median ratios.
Usage: python3 hedonic-regressivity-lab.py <sales_csv>
"""
import csv, math, sys
import numpy as np
from collections import defaultdict

COND = {'Poor': 1, 'Fair': 2, 'Average': 3, 'Good': 4, 'Very Good': 5, 'Excellent': 6}
GRADES = ['Low Quality', 'Fair Quality', 'Average', 'Above Average', 'Good Quality',
          'Very Good', 'Excellent', 'Superior', 'Exceptional-A', 'Exceptional-B',
          'Exceptional-C', 'Exceptional-D']
GIX = {g: i for i, g in enumerate(GRADES)}
ANCHOR = '2024Q4'
TIERS = [(0, 600_000, '<600k'), (600_000, 1_200_000, '600k-1.2M'),
         (1_200_000, 2_000_000, '1.2M-2M'), (2_000_000, float('inf'), '>2M')]


def load(path):
    rows = []
    for r in csv.DictReader(open(path)):
        try:
            if not r['gba'] or float(r['gba']) <= 0:
                continue
            if not r['sale_price'] or float(r['sale_price']) <= 0:
                continue
            rows.append(dict(
                yr=r['sale_date'][:4],
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
                cell=f"{int(float(r['lat']) // 0.008)}:{int(float(r['lon']) // 0.008)}",
                ward=r['ward'], usecode=r['usecode']))
        except ValueError:
            continue
    return rows


def vocab(key, items, min_n):
    c = defaultdict(int)
    for r in items:
        c[r[key]] += 1
    return {v: i for i, v in enumerate(sorted((k for k, n in c.items() if n >= min_n), key=str))}


def iaao(pred, sp):
    r = pred / sp
    m = float(np.median(r))
    cod = 100 * float(np.mean(np.abs(r - m))) / m
    prd = float(np.mean(r)) / (pred.sum() / sp.sum())
    vp = 0.5 * (sp + pred / m)
    x = np.log(vp) / math.log(2)
    y = r / m - 1
    xc = x - x.mean()
    prb = float((xc * (y - y.mean())).sum() / (xc ** 2).sum())
    mdape = 100 * float(np.median(np.abs(pred - sp) / sp))
    return dict(n=len(sp), med=m, cod=cod, prd=prd, prb=prb, mdape=mdape)


def tier_meds(pred, sp):
    out = []
    r = pred / sp
    for lo, hi, name in TIERS:
        mask = (sp >= lo) & (sp < hi)
        out.append(f"{name} {float(np.median(r[mask])):.3f}(n={int(mask.sum())})")
    return '  '.join(out)


def report(tag, pred, sp):
    mt = iaao(pred, sp)
    gates = [0.90 <= mt['med'] <= 1.10, mt['cod'] <= 15,
             0.98 <= mt['prd'] <= 1.03, -0.05 <= mt['prb'] <= 0.05]
    flag = '✅ ALL' if all(gates) else '❌'
    print(f"{tag:<28} med={mt['med']:.3f} COD={mt['cod']:.1f} PRD={mt['prd']:.3f} "
          f"PRB={mt['prb']:+.3f} MdAPE={mt['mdape']:.1f}  {flag}")
    print(f"{'':<28} tiers: {tier_meds(pred, sp)}")


class Model:
    """Configurable hedonic. Feature flags select rung content."""

    def __init__(self, train, grade_min_n=25, ordinal_grade=False, curvature=False, lam=1.0):
        self.gm = grade_min_n
        self.og = ordinal_grade
        self.cv = curvature
        self.lam = lam
        self.cells = vocab('cell', train, 25)
        self.wards = vocab('ward', train, 5)
        self.qs = vocab('q', train, 5)
        self.grades = vocab('gix', train, grade_min_n)
        self.conds = vocab('cond', train, 25)
        self.uses = vocab('usecode', train, 25)

    def design(self, r, q_override=None):
        q = q_override or r['q']
        lg = math.log(r['gba'])
        x = [1.0, lg, math.log(r['land'] + 1), r['bed'], r['bath'], r['hbath'], r['rooms'],
             r['stories'], r['ac'], r['fp'], min(r['units'], 4),
             (2026 - r['ayb']) / 100 if r['ayb'] > 1800 else 1.0,
             (2026 - r['eyb']) / 100 if r['eyb'] > 1800 else 0.5,
             1.0 if r['rmdl'] >= 2010 else 0.0, 1.0 if 1990 <= r['rmdl'] < 2010 else 0.0]
        if self.og:
            g = r['gix'] / 11.0
            x += [g, g * g, g * (lg - 7.0)]
        if self.cv:
            x += [(lg - 7.0) ** 2]
        for vb, key in ((self.grades, 'gix'), (self.conds, 'cond'), (self.uses, 'usecode'),
                        (self.qs, 'q' if q_override is None else None), (self.wards, 'ward')):
            val = q if key is None else r[key]
            v = [0.0] * len(vb)
            if val in vb:
                v[vb[val]] = 1.0
            x += v
        v = [0.0] * len(self.cells)
        if r['cell'] in self.cells:
            v[self.cells[r['cell']]] = 1.0
        x += v
        return x

    def fit(self, train):
        X = np.array([self.design(r) for r in train])
        y = np.log(np.array([r['price'] for r in train]))
        self.beta = np.linalg.solve(X.T @ X + self.lam * np.eye(X.shape[1]), X.T @ y)
        return self

    def predict_log(self, rows, q_override=None):
        X = np.array([self.design(r, q_override=q_override) for r in rows])
        return X @ self.beta


def carry_index(rows):
    qpsf = defaultdict(list)
    for r in rows:
        qpsf[r['q']].append(r['price'] / r['gba'])
    return {q: float(np.median(v)) for q, v in qpsf.items() if len(v) >= 50}


def oof_predictions(model_factory, train, k=5, seed=20260715):
    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(train))
    folds = np.array_split(idx, k)
    oof = np.zeros(len(train))
    for f in folds:
        mask = np.ones(len(train), bool)
        mask[f] = False
        tr = [train[i] for i in np.where(mask)[0]]
        m = model_factory(tr).fit(tr)
        oof[f] = m.predict_log([train[i] for i in f])
    return oof


def fit_calibration(logpred, logtrue, knots):
    """Piecewise-linear correction c(logpred) ~ logtrue - logpred, least squares
    on a linear spline basis. Returns callable."""
    resid = logtrue - logpred
    t = np.asarray(knots)
    B = [np.ones_like(logpred), logpred]
    for kn in t:
        B.append(np.maximum(logpred - kn, 0.0))
    B = np.vstack(B).T
    coef, *_ = np.linalg.lstsq(B, resid, rcond=None)

    def c(lp):
        out = coef[0] + coef[1] * lp
        for j, kn in enumerate(t):
            out = out + coef[2 + j] * np.maximum(lp - kn, 0.0)
        return out
    return c


def main():
    rows = load(sys.argv[1])
    train = [r for r in rows if r['yr'] <= '2024']
    test = [r for r in rows if r['yr'] >= '2025']
    qidx = carry_index(rows)
    carry = np.array([qidx.get(r['q'], qidx[ANCHOR]) / qidx[ANCHOR] for r in test])
    sp = np.array([r['price'] for r in test])
    print(f"train n={len(train):,}  test n={len(test):,}\n")

    # H0 — replication of the diagnostic
    m0 = Model(train).fit(train)
    p0 = np.exp(m0.predict_log(test, q_override=ANCHOR)) * carry
    report('H0 prototype (replicate)', p0, sp)

    # H1 — grade fix
    m1 = Model(train, grade_min_n=10, ordinal_grade=True).fit(train)
    p1 = np.exp(m1.predict_log(test, q_override=ANCHOR)) * carry
    report('H1 +grade fix', p1, sp)

    # H2 — + curvature
    m2 = Model(train, grade_min_n=10, ordinal_grade=True, curvature=True).fit(train)
    p2 = np.exp(m2.predict_log(test, q_override=ANCHOR)) * carry
    report('H2 +curvature', p2, sp)

    # H3 — lambda sweep on H2 config
    for lam in (0.3, 0.1, 0.03):
        m = Model(train, grade_min_n=10, ordinal_grade=True, curvature=True, lam=lam).fit(train)
        p = np.exp(m.predict_log(test, q_override=ANCHOR)) * carry
        report(f'H3 lam={lam}', p, sp)

    # H4 — cross-fitted calibration on best config so far (H2 baseline lam=1
    # and the lambda that looked best get calibrated; report both)
    logsp_tr = np.log(np.array([r['price'] for r in train]))
    for lam in (1.0, 0.1):
        fac = lambda tr: Model(tr, grade_min_n=10, ordinal_grade=True, curvature=True, lam=lam)
        oof = oof_predictions(fac, train)
        knots = np.quantile(oof, [0.10, 0.35, 0.65, 0.90, 0.985])
        cal = fit_calibration(oof, logsp_tr, knots)
        m = fac(train).fit(train)
        lp = m.predict_log(test, q_override=ANCHOR)
        p = np.exp(lp + cal(lp)) * carry
        report(f'H4 lam={lam} +calibration', p, sp)


if __name__ == '__main__':
    main()
