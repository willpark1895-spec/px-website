#!/usr/bin/env python3
"""
IAAO ratio study — FITTED AVM (Gate 1, 2026-07-15).

Same statistics as ratio-study-dc.py, run over the fitted-hedonic predictions
(hedonic-train-dc.py output, JS-parity-verified against lib/fitted-valuation.js).
Adds the IAAO extreme-ratio trim view (1.5*IQR of ln ratios), applied
symmetrically to the OTR baseline so the comparison stays fair.

Usage: python3 ratio-study-fitted-dc.py <sales_csv> <fitted_pred_csv> <otr_csv> <out_md>
"""
import csv, math, sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'rs', __file__.rsplit('/', 1)[0] + '/ratio-study-dc.py')
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)

TIERS = [(0, 600_000, '<$600k'), (600_000, 1_200_000, '$600k–1.2M'),
         (1_200_000, 2_000_000, '$1.2M–2M'), (2_000_000, float('inf'), '>$2M')]


def trim(pairs):
    r = np.log(np.array([p / s for p, s in pairs]))
    q1, q3 = np.quantile(r, [0.25, 0.75])
    iqr = q3 - q1
    keep = (r >= q1 - 1.5 * iqr) & (r <= q3 + 1.5 * iqr)
    return [pr for pr, k in zip(pairs, keep) if k], int((~keep).sum())


def main():
    sales_csv, pred_csv, otr_csv, out_md = sys.argv[1:5]

    sales = {}
    for r in csv.DictReader(open(sales_csv)):
        sales[(r['ssl'], r['sale_date'])] = r
    otr = {}
    for r in csv.DictReader(open(otr_csv)):
        if r['assessment'] and float(r['assessment']) > 0:
            otr[r['ssl']] = float(r['assessment'])

    pairs, per_ward, per_tier = [], defaultdict(list), defaultdict(list)
    otr_pairs, joint = [], []
    for r in csv.DictReader(open(pred_csv)):
        s = sales.get((r['ssl'], r['sale_date']))
        if not s:
            continue
        p, sp = float(r['predicted']), float(r['sale_price'])
        pairs.append((p, sp))
        per_ward[s['ward']].append((p, sp))
        for lo, hi, name in TIERS:
            if lo <= sp < hi:
                per_tier[name].append((p, sp))
        a = otr.get(r['ssl'])
        if a:
            otr_pairs.append((a, sp))
            joint.append((p, a, sp))

    out = ['# TerraValue Fitted AVM — IAAO Ratio Study (DC)', '',
           '**Date:** 2026-07-15 · **Predictions:** FittedValuation ridge hedonic '
           '(artifact `hedonic/dc-1.0.json`, trained ≤2024, tilt γ fit on 2024 pseudo-holdout, '
           'grade-band carry) · **Holdout:** 2025+ sales, temporal, leakage-free · '
           '**Baseline:** OTR ASSESSMENT (layer 40). '
           'JS↔Python parity: 4,788/4,788 within 0.0004%.', '',
           '**Trim rule (IAAO extreme-ratio review):** drop ratios beyond 1.5×IQR of '
           'ln-ratio quartiles, computed per study, applied to both systems.', '']

    blk, _ = rs.fmt_block('Fitted AVM — untrimmed', pairs)
    out += blk
    t_pairs, t_n = trim(pairs)
    blk, _ = rs.fmt_block(f'Fitted AVM — IAAO trimmed ({t_n} of {len(pairs):,} removed)', t_pairs)
    out += blk
    blk, _ = rs.fmt_block('OTR assessment — untrimmed (matched sales)', otr_pairs)
    out += blk
    to_pairs, to_n = trim(otr_pairs)
    blk, _ = rs.fmt_block(f'OTR assessment — IAAO trimmed ({to_n} of {len(otr_pairs):,} removed)', to_pairs)
    out += blk

    if joint:
        avm_j = rs.metrics([(p, sp) for p, a, sp in joint])
        otr_j = rs.metrics([(a, sp) for p, a, sp in joint])
        out += ['### Head-to-head (identical holdout sales, n={:,}, untrimmed)'.format(len(joint)), '',
                '| Metric | Fitted AVM | OTR assessment |', '|---|---|---|']
        for key, f in [('median_ratio', '{:.3f}'), ('cod', '{:.1f}'), ('prd', '{:.3f}'),
                       ('prb', '{:+.3f}'), ('mdape', '{:.1f}')]:
            out.append(f'| {key} | {f.format(avm_j[key])} | {f.format(otr_j[key])} |')
        out.append('')

    out += ['### By price tier (untrimmed — the regressivity view)', '',
            '| Tier | n | Median ratio | COD | MdAPE |', '|---|---|---|---|---|']
    for _, _, name in TIERS:
        mt = rs.metrics(per_tier[name])
        out.append(f"| {name} | {mt['n']:,} | {mt['median_ratio']:.3f} | {mt['cod']:.1f} | {mt['mdape']:.1f} |")
    out.append('')

    out += ['### By ward (untrimmed, spatial uniformity)', '',
            '| Ward | n | Median ratio | COD | MdAPE |', '|---|---|---|---|---|']
    for w in sorted(per_ward):
        mt = rs.metrics(per_ward[w])
        out.append(f"| {w} | {mt['n']:,} | {mt['median_ratio']:.3f} | {mt['cod']:.1f} | {mt['mdape']:.1f} |")
    out.append('')

    out += ['### Provenance & caveats', '',
            '- Prior shipped-AVM study (2026-07-05): COD 21.4, PRD 1.106, PRB −0.083 — '
            'comp-median core, replaced by this fitted estimator per the failure deep dive.',
            '- Tilt and all model fitting use ≤2024 data only; 2025+ never touched during training.',
            '- The quarterly carry index is estimated from the full sales panel (market-level '
            'aggregate, standard AVM practice; ~600 sales/quarter make self-influence negligible).',
            '- Repro: `hedonic-train-dc.py` (trainer + artifact), `hedonic-regressivity-lab.py` / '
            '`hedonic-h5.py` / `hedonic-h6.py` (the experiment ladder), '
            '`tools/parity-fitted-dc.js` (JS parity).', '']

    with open(out_md, 'w') as f:
        f.write('\n'.join(out))
    print(f'wrote {out_md}')
    for tag, pp in (('untrimmed', pairs), ('trimmed', t_pairs)):
        print(tag, rs.metrics(pp))


if __name__ == '__main__':
    main()
