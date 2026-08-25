#!/usr/bin/env python3
"""H5 rungs — direct attacks on vertical equity. Builds on hedonic-regressivity-lab."""
import sys, math
import numpy as np
from collections import defaultdict

lab = __import__('hedonic-regressivity-lab')


class Model5(lab.Model):
    """Adds luxury features + weighted ridge."""

    def __init__(self, train, lam=1.0, lux=False, wexp=0.0):
        super().__init__(train, grade_min_n=10, ordinal_grade=True, curvature=True, lam=lam)
        self.lux = lux
        self.wexp = wexp

    def design(self, r, q_override=None):
        x = super().design(r, q_override)
        if self.lux:
            hi = 1.0 if r['gix'] >= 6 else 0.0
            lg = math.log(r['gba'])
            x += [hi * math.log(r['land'] + 1),          # lot premium matters at top
                  hi * (lg - 7.0),                        # size slope steeper at top
                  hi * r['bath'],                         # bath count at top
                  (r['gix'] / 11.0) * (r['cond'] - 3.0)]  # grade x condition
        return x

    def fit(self, train):
        X = np.array([self.design(r) for r in train])
        y = np.log(np.array([r['price'] for r in train]))
        if self.wexp:
            # standard weighted ridge: (X'WX + lam I) beta = X'Wy
            w = (np.array([r['price'] for r in train]) / 1e6) ** self.wexp
            self.beta = np.linalg.solve(X.T @ (X * w[:, None]) + self.lam * np.eye(X.shape[1]), X.T @ (w * y))
        else:
            self.beta = np.linalg.solve(X.T @ X + self.lam * np.eye(X.shape[1]), X.T @ y)
        return self


def prb_of(pred, sp):
    r = pred / sp
    m = float(np.median(r))
    vp = 0.5 * (sp + pred / m)
    x = np.log(vp) / math.log(2)
    y = r / m - 1
    xc = x - x.mean()
    return float((xc * (y - y.mean())).sum() / (xc ** 2).sum())


def fit_tilt(logpred, sp, target_prb=0.0):
    """Solve gamma so OOF PRB == target. p' = exp(logpred + gamma*(logpred - c))."""
    c = float(np.median(logpred))

    def prb_at(g):
        return prb_of(np.exp(logpred + g * (logpred - c)), sp)
    lo, hi = -0.05, 0.60
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if prb_at(mid) < target_prb:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi), c


def main():
    rows = lab.load(sys.argv[1])
    train = [r for r in rows if r['yr'] <= '2024']
    test = [r for r in rows if r['yr'] >= '2025']
    qidx = lab.carry_index(rows)
    carry = np.array([qidx.get(r['q'], qidx[lab.ANCHOR]) / qidx[lab.ANCHOR] for r in test])
    sp_te = np.array([r['price'] for r in test])
    sp_tr = np.array([r['price'] for r in train])
    print(f"train n={len(train):,} test n={len(test):,}\n")

    configs = [
        ('H5a base+tilt',        dict(lam=1.0, lux=False, wexp=0.0), True),
        ('H5b lux feats',        dict(lam=1.0, lux=True,  wexp=0.0), False),
        ('H5b lux+tilt',         dict(lam=1.0, lux=True,  wexp=0.0), True),
        ('H5c wtrain(.4)',       dict(lam=1.0, lux=True,  wexp=0.4), False),
        ('H5c wtrain(.4)+tilt',  dict(lam=1.0, lux=True,  wexp=0.4), True),
        ('H5c wtrain(.8)+tilt',  dict(lam=1.0, lux=True,  wexp=0.8), True),
    ]
    for tag, kw, tilt in configs:
        fac = lambda tr: Model5(tr, **kw)
        m = fac(train).fit(train)
        lp_te = m.predict_log(test, q_override=lab.ANCHOR)
        if tilt:
            oof = lab.oof_predictions(fac, train)
            print(f"  [{tag}] OOF PRB before tilt: {prb_of(np.exp(oof), sp_tr):+.3f}", end=' ')
            g, c = fit_tilt(oof, sp_tr)
            print(f"-> gamma={g:.3f}")
            lp_te = lp_te + g * (lp_te - c)
        pred = np.exp(lp_te) * carry
        lab.report(tag, pred, sp_te)


if __name__ == '__main__':
    main()
