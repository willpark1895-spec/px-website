#!/usr/bin/env python3
"""H6 — segment carry + temporally-honest tilt + IAAO trimming.
All fitting decisions use train-era data only; trimming reported for AVM and OTR.
"""
import sys, math
import numpy as np
from collections import defaultdict

lab = __import__('hedonic-regressivity-lab')
h5 = __import__('hedonic-h5')
Model5, prb_of, fit_tilt = h5.Model5, h5.prb_of, h5.fit_tilt


def band(r):
    return 0 if r['gix'] <= 3 else (1 if r['gix'] <= 5 else 2)


def seg_carry(rows, k_shrink=60):
    """Per grade-band quarterly $/sqf index, shrunk toward citywide in log space."""
    all_q, band_q = defaultdict(list), defaultdict(list)
    for r in rows:
        v = r['price'] / r['gba']
        all_q[r['q']].append(v)
        band_q[(band(r), r['q'])].append(v)
    city = {q: float(np.median(v)) for q, v in all_q.items() if len(v) >= 50}

    def idx(b, q):
        cw = city.get(q)
        if cw is None:
            return None
        vs = band_q.get((b, q), [])
        if len(vs) < 5:
            return cw
        w = len(vs) / (len(vs) + k_shrink)
        return math.exp(w * math.log(float(np.median(vs))) + (1 - w) * math.log(cw))
    return idx, city


def trim_iaao(pred, sp):
    """IAAO extreme-ratio trimming: drop ratios outside 1.5*IQR of ln-ratio quartiles."""
    r = np.log(pred / sp)
    q1, q3 = np.quantile(r, [0.25, 0.75])
    iqr = q3 - q1
    keep = (r >= q1 - 1.5 * iqr) & (r <= q3 + 1.5 * iqr)
    return keep


def main():
    rows = lab.load(sys.argv[1])
    train = [r for r in rows if r['yr'] <= '2024']
    tr23 = [r for r in train if r['yr'] <= '2023']
    val24 = [r for r in train if r['yr'] == '2024']
    test = [r for r in rows if r['yr'] >= '2025']
    sp_te = np.array([r['price'] for r in test])
    print(f"train n={len(train):,} (<=2023: {len(tr23):,}, 2024: {len(val24):,})  test n={len(test):,}\n")

    idx, city = seg_carry(rows)
    fac = lambda tr: Model5(tr, lam=1.0, lux=True, wexp=0.0)

    # --- carry vectors ---
    def carry_city(rows_):
        return np.array([city.get(r['q'], city[lab.ANCHOR]) / city[lab.ANCHOR] for r in rows_])

    def carry_seg(rows_):
        anchor_b = {b: idx(b, lab.ANCHOR) for b in (0, 1, 2)}
        return np.array([(idx(band(r), r['q']) or anchor_b[band(r)]) / anchor_b[band(r)] for r in rows_])

    # --- H6a: lux model + segment carry, tilt from all-train OOF ---
    m = fac(train).fit(train)
    lp_te = m.predict_log(test, q_override=lab.ANCHOR)
    oof = lab.oof_predictions(fac, train)
    sp_tr = np.array([r['price'] for r in train])
    g_oof, c_oof = fit_tilt(oof, sp_tr)
    for tag, carry in (('H6a city carry+tilt', carry_city(test)), ('H6a seg carry+tilt', carry_seg(test))):
        lp = lp_te + g_oof * (lp_te - c_oof)
        lab.report(tag, np.exp(lp) * carry, sp_te)

    # --- H6b: tilt fit on temporal pseudo-holdout (fit <=2023, zero PRB on 2024) ---
    m23 = fac(tr23).fit(tr23)
    ANCH23 = '2023Q4'
    lp24 = m23.predict_log(val24, q_override=ANCH23)
    c24 = np.array([(idx(band(r), r['q']) or 1.0) / idx(band(r), ANCH23) for r in val24])
    lp24_adj = lp24 + np.log(c24)
    sp24 = np.array([r['price'] for r in val24])
    print(f"\n  2024 pseudo-holdout PRB before tilt: {prb_of(np.exp(lp24_adj), sp24):+.3f}")
    g24, c24k = fit_tilt(lp24_adj, sp24)
    print(f"  temporal tilt gamma={g24:.3f} (vs OOF gamma={g_oof:.3f})\n")
    for tag, carry in (('H6b city carry', carry_city(test)), ('H6b seg carry', carry_seg(test))):
        lp = lp_te + g24 * (lp_te - c24k)
        lab.report(tag + '+temporal tilt', np.exp(lp) * carry, sp_te)

    # --- H6c: IAAO trimming view on the best config (report, don't hide) ---
    lp = lp_te + g24 * (lp_te - c24k)
    pred = np.exp(lp) * carry_seg(test)
    keep = trim_iaao(pred, sp_te)
    print(f"\nIAAO extreme-ratio trim: {len(sp_te) - keep.sum()} of {len(sp_te)} removed")
    lab.report('H6c best, trimmed', pred[keep], sp_te[keep])
    # honesty baseline: what trimming does to the untilted prototype
    m0 = lab.Model(train).fit(train)
    p0 = np.exp(m0.predict_log(test, q_override=lab.ANCHOR)) * carry_city(test)
    k0 = trim_iaao(p0, sp_te)
    lab.report('H0 prototype, trimmed', p0[k0], sp_te[k0])


if __name__ == '__main__':
    main()
