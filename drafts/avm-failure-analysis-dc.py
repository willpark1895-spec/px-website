#!/usr/bin/env python3
"""
AVM failure deep-dive — DC (Milestone A diagnosis, 2026-07-05).

Replicates avm-predict-dc.js comp selection exactly (k=5 nearest, same class,
strictly-prior, <=365d), then runs a counterfactual ladder on IDENTICAL comps
to attribute the COD-21.4 failure to specific causes:

  E0  engine prediction (from dc_avm_predictions.csv)     — as measured
  E1  median raw comp price (no adjustments at all)       — is the grid inert?
  E2  median comp $/sqft(GBA) x subject GBA               — size-axis fix alone
  E3  E2 + DC quarterly time index (from sales panel)     — + time fix
  E4  E3 + grade factor (fit on <=2024 sales only)        — + quality fix

Plus diagnostics: comp price dispersion (noise floor), actual DC appreciation
vs engine's Atlanta 3.8%/yr, grade price gradient, error correlates.

Usage: python3 avm-failure-analysis-dc.py <sales_csv> <pred_csv> [out_md]
"""
import csv, math, sys
from collections import defaultdict
import numpy as np

K, LOOKBACK_D, CELL = 5, 365, 0.01
SF = {'11.0', '12.0', '13.0', '15.0'}
COND = {'Poor': 1, 'Fair': 2, 'Average': 3, 'Good': 4, 'Very Good': 5, 'Excellent': 6}
GRADES = ['Low Quality', 'Fair Quality', 'Average', 'Above Average', 'Good Quality',
          'Very Good', 'Excellent', 'Superior', 'Exceptional-A', 'Exceptional-B',
          'Exceptional-C', 'Exceptional-D']
GRADE_IX = {g: i for i, g in enumerate(GRADES)}


def load(sales_csv):
    rows = []
    for i, r in enumerate(csv.DictReader(open(sales_csv))):
        try:
            d = r['sale_date']
            epoch_d = (np.datetime64(d) - np.datetime64('2020-01-01')).astype(int)
            rows.append(dict(
                i=i, ssl=r['ssl'], date=d, ed=int(epoch_d), yr=d[:4],
                price=float(r['sale_price']), grp='sf' if r['usecode'] in SF else 'mf',
                gba=float(r['gba'] or 0) or None, land=float(r['landarea'] or 0) or None,
                ayb=float(r['ayb'] or 0) or None, cond=COND.get(r['condition']),
                grade=r['grade'], gix=GRADE_IX.get(r['grade']),
                lat=float(r['lat']), lon=float(r['lon']), ward=r['ward']))
        except (ValueError, KeyError):
            continue
    rows.sort(key=lambda r: r['ed'])
    return rows


def build_grid(rows):
    g = {'sf': defaultdict(list), 'mf': defaultdict(list)}
    for r in rows:
        g[r['grp']][(int(r['lat'] // CELL), int(r['lon'] // CELL))].append(r)
    return g


def hav_km(la1, lo1, la2, lo2):
    d = math.pi / 180
    a = math.sin((la2 - la1) * d / 2) ** 2 + math.cos(la1 * d) * math.cos(la2 * d) * math.sin((lo2 - lo1) * d / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def comps_for(subj, grid):
    ci, cj = int(subj['lat'] // CELL), int(subj['lon'] // CELL)
    cands = []
    for ring in range(0, 9):
        for di in range(-ring, ring + 1):
            for dj in range(-ring, ring + 1):
                if max(abs(di), abs(dj)) != ring:
                    continue
                for c in grid[subj['grp']].get((ci + di, cj + dj), ()):
                    if c['ed'] >= subj['ed']:
                        break
                    if c['ed'] < subj['ed'] - LOOKBACK_D or c['ssl'] == subj['ssl']:
                        continue
                    cands.append(c)
        if len(cands) >= K * 3 and ring >= 1:
            break
    if len(cands) < 2:
        return None
    cands.sort(key=lambda c: hav_km(subj['lat'], subj['lon'], c['lat'], c['lon']))
    return cands[:K]


def iaao(pairs):
    p = np.array([x for x, _ in pairs]); s = np.array([y for _, y in pairs])
    r = p / s
    m = float(np.median(r))
    cod = 100 * float(np.mean(np.abs(r - m))) / m
    prd = float(np.mean(r)) / (float(p.sum()) / float(s.sum()))
    vp = 0.5 * (s + p / m); ok = vp > 0
    x = np.log(vp[ok]) / math.log(2); y = r[ok] / m - 1
    xc = x - x.mean()
    prb = float((xc * (y - y.mean())).sum() / (xc ** 2).sum())
    mdape = 100 * float(np.median(np.abs(p - s) / s))
    return dict(n=len(pairs), med=m, cod=cod, prd=prd, prb=prb, mdape=mdape)


def fmt(name, mt):
    return f"| {name} | {mt['n']:,} | {mt['med']:.3f} | {mt['cod']:.1f} | {mt['prd']:.3f} | {mt['prb']:+.3f} | {mt['mdape']:.1f} |"


def main():
    sales_csv, pred_csv = sys.argv[1], sys.argv[2]
    out_md = sys.argv[3] if len(sys.argv) > 3 else None
    rows = load(sales_csv)
    grid = build_grid(rows)

    engine_pred = {}
    for r in csv.DictReader(open(pred_csv)):
        engine_pred[(r['ssl'], r['sale_date'])] = float(r['predicted'])

    # ---- DC quarterly time index from the sales panel itself (median $/sqft GBA by quarter)
    qpsf = defaultdict(list)
    for r in rows:
        if r['gba']:
            q = r['date'][:4] + 'Q' + str((int(r['date'][5:7]) - 1) // 3 + 1)
            qpsf[q].append(r['price'] / r['gba'])
    qidx = {q: float(np.median(v)) for q, v in sorted(qpsf.items()) if len(v) >= 50}
    quarters = sorted(qidx)
    # annualized DC appreciation 2020->2026 for the time-constant check
    first, last = qidx[quarters[0]], qidx[quarters[-1]]
    yrs_span = (len(quarters) - 1) / 4
    dc_annual = (last / first) ** (1 / yrs_span) - 1

    # ---- grade factors fit on <=2024 only (no leakage into holdout)
    gpsf = defaultdict(list)
    for r in rows:
        if r['gba'] and r['yr'] <= '2024' and r['gix'] is not None:
            q = r['date'][:4] + 'Q' + str((int(r['date'][5:7]) - 1) // 3 + 1)
            if q in qidx:
                gpsf[r['gix']].append((r['price'] / r['gba']) / qidx[q])  # time-detrended
    grade_f = {g: float(np.median(v)) for g, v in gpsf.items() if len(v) >= 30}
    base_g = grade_f.get(GRADE_IX['Average'], 1.0)
    grade_f = {g: v / base_g for g, v in grade_f.items()}

    # ---- ladder + diagnostics over holdout
    E = {k: [] for k in ('E0', 'E1', 'E2', 'E3', 'E4')}
    comp_cv, adj_moves = [], []
    err_grade, err_gba, err_dist, err_age = [], [], [], []
    n_nog = 0
    for subj in rows:
        if subj['yr'] < '2025':
            continue
        key = (subj['ssl'], subj['date'])
        if key not in engine_pred:
            continue
        cs = comps_for(subj, grid)
        if not cs:
            continue
        sp = subj['price']
        cp = np.array([c['price'] for c in cs])

        E['E0'].append((engine_pred[key], sp))
        e1 = float(np.median(cp))
        E['E1'].append((e1, sp))
        comp_cv.append(float(cp.std() / cp.mean()))
        adj_moves.append(abs(engine_pred[key] / (cp.mean()) - 1))  # engine move vs raw mean

        gb = [c for c in cs if c['gba']]
        if subj['gba'] and gb:
            psf = np.array([c['price'] / c['gba'] for c in gb])
            e2 = float(np.median(psf)) * subj['gba']
            E['E2'].append((e2, sp))
            # E3: time-index each comp's $/sqft to subject quarter
            sq = subj['date'][:4] + 'Q' + str((int(subj['date'][5:7]) - 1) // 3 + 1)
            if sq in qidx:
                psf_t = []
                for c in gb:
                    cq = c['date'][:4] + 'Q' + str((int(c['date'][5:7]) - 1) // 3 + 1)
                    if cq in qidx:
                        psf_t.append((c['price'] / c['gba']) * (qidx[sq] / qidx[cq]))
                if psf_t:
                    e3 = float(np.median(psf_t)) * subj['gba']
                    E['E3'].append((e3, sp))
                    # E4: grade-adjust each comp toward subject grade
                    if subj['gix'] in grade_f:
                        psf_g = []
                        for c, pt in zip([c for c in gb if (c['date'][:4] + 'Q' + str((int(c['date'][5:7]) - 1) // 3 + 1)) in qidx], psf_t):
                            if c['gix'] in grade_f:
                                psf_g.append(pt * (grade_f[subj['gix']] / grade_f[c['gix']]))
                        if len(psf_g) >= 2:
                            E['E4'].append((float(np.median(psf_g)) * subj['gba'], sp))
                        else:
                            n_nog += 1

        # error correlates (on E1, the raw k-NN, to see what the grid SHOULD fix)
        lr = math.log(e1 / sp)
        if subj['gix'] is not None:
            gd = [c['gix'] for c in cs if c['gix'] is not None]
            if gd:
                err_grade.append((float(np.mean(gd)) - subj['gix'], lr))
        if subj['gba'] and gb:
            err_gba.append((math.log(float(np.mean([c['gba'] for c in gb])) / subj['gba']), lr))
        err_dist.append((float(np.mean([hav_km(subj['lat'], subj['lon'], c['lat'], c['lon']) for c in cs])), lr))
        err_age.append((float(np.mean([subj['ed'] - c['ed'] for c in cs])) / 30.44, lr))

    def corr(pairs):
        a = np.array([x for x, _ in pairs]); b = np.array([y for _, y in pairs])
        return float(np.corrcoef(a, b)[0, 1]), len(pairs)

    lines = []
    lines.append("## Counterfactual ladder — identical comps, 2025+ holdout\n")
    lines.append("| Predictor | n | Med ratio | COD | PRD | PRB | MdAPE |")
    lines.append("|---|---|---|---|---|---|---|")
    for k, label in [('E0', 'E0 engine (adjustment grid)'), ('E1', 'E1 raw comp median (no adjustments)'),
                     ('E2', 'E2 GBA $/sqft axis'), ('E3', 'E3 + DC quarterly time index'),
                     ('E4', 'E4 + grade factors (fit ≤2024)')]:
        if E[k]:
            lines.append(fmt(label, iaao(E[k])))
    lines.append("")
    lines.append(f"- Comp price dispersion (noise floor): median within-comp-set CV = **{np.median(comp_cv)*100:.1f}%**")
    lines.append(f"- Engine adjustment magnitude: median |engine pred vs raw comp mean| = **{np.median(adj_moves)*100:.1f}%** (the grid barely moves prices)")
    cg, ng = corr(err_grade); cb, nb = corr(err_gba); cd, nd = corr(err_dist); ca, na = corr(err_age)
    lines.append(f"- Corr(log ratio error, comp−subject grade gap): **{cg:+.3f}** (n={ng:,})")
    lines.append(f"- Corr(log ratio error, log comp/subject GBA gap): **{cb:+.3f}** (n={nb:,})")
    lines.append(f"- Corr(log ratio error, mean comp distance km): {cd:+.3f} (n={nd:,})")
    lines.append(f"- Corr(log ratio error, mean comp age months): {ca:+.3f} (n={na:,})")
    lines.append(f"- DC actual appreciation (panel-derived, {quarters[0]}→{quarters[-1]}): **{dc_annual*100:.1f}%/yr** vs engine's Atlanta constant 3.8%/yr")
    lines.append("")
    lines.append("### Grade price gradient (time-detrended $/sqft vs 'Average', fit ≤2024)\n")
    lines.append("| Grade | Factor | n |")
    lines.append("|---|---|---|")
    for g in sorted(grade_f):
        lines.append(f"| {GRADES[g]} | {grade_f[g]:.2f}× | {len(gpsf[g]):,} |")
    text = "\n".join(lines)
    print(text)
    if out_md:
        open(out_md, 'w').write(text + "\n")


if __name__ == '__main__':
    main()
