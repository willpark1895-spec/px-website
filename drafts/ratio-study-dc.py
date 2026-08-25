#!/usr/bin/env python3
"""
IAAO ratio-study harness — DC (Milestone A, 2026-07-05). Stdlib-only.

Computes, for any set of (predicted, sale_price) pairs:
  median ratio, COD, PRD, PRB, MdAPE — each with bootstrap 90% CIs.

Evaluations:
  1. TerraValue AVM (engine salesComparison backtest) — all sales + 2025+ holdout.
  2. OTR ASSESSMENT baseline (current TY value; only honest on 2025+ sales).
  3. Per-year and per-ward breakdowns (spatial uniformity check — the AVM has
     no fitted parameters, so grouped breakdown replaces grouped CV).

IAAO standards (single-family residential): COD <= 15 (older/heterogeneous
areas), PRD in [0.98, 1.03], PRB in [-0.05, +0.05], median ratio in [0.90, 1.10].

Usage: python3 ratio-study-dc.py <sales_csv> <avm_pred_csv> <otr_csv> <out_md>
"""
import csv, math, random, statistics, sys
from collections import defaultdict

random.seed(20260705)
B = 1000  # bootstrap replicates


def median(xs):
    return statistics.median(xs)


def metrics(pairs):
    """pairs: list of (predicted, sale_price). Returns dict of IAAO metrics."""
    ratios = [p / s for p, s in pairs]
    m = median(ratios)
    cod = 100.0 * (sum(abs(r - m) for r in ratios) / len(ratios)) / m
    mean_ratio = sum(ratios) / len(ratios)
    wtd = sum(p for p, s in pairs) / sum(s for p, s in pairs)  # weighted mean ratio
    prd = mean_ratio / wtd
    # PRB (IAAO 2013 standard): (r/m - 1) ~ ln(0.5*(SP + P/m)) / ln 2
    ys, xs = [], []
    for (p, s), r in zip(pairs, ratios):
        value_proxy = 0.5 * (s + p / m)
        if value_proxy <= 0:
            continue
        ys.append(r / m - 1.0)
        xs.append(math.log(value_proxy) / math.log(2))
    xbar, ybar = sum(xs) / len(xs), sum(ys) / len(ys)
    sxx = sum((x - xbar) ** 2 for x in xs)
    prb = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys)) / sxx if sxx else float("nan")
    mdape = 100.0 * median([abs(p - s) / s for p, s in pairs])
    return {"n": len(pairs), "median_ratio": m, "cod": cod, "prd": prd, "prb": prb, "mdape": mdape}


def boot_cis(pairs, b=B, alpha=0.10):
    """One resampling pass per block: returns {metric: (lo, hi)}."""
    try:
        import numpy as np
        P = np.array([p for p, s in pairs]); S = np.array([s for p, s in pairs])
        n = len(pairs)
        rng = np.random.default_rng(20260705)
        acc = {k: [] for k in ("median_ratio", "cod", "prd", "prb", "mdape")}
        for _ in range(b):
            idx = rng.integers(0, n, n)
            p, s = P[idx], S[idx]
            r = p / s
            m = float(np.median(r))
            acc["median_ratio"].append(m)
            acc["cod"].append(100.0 * float(np.mean(np.abs(r - m))) / m)
            acc["prd"].append(float(np.mean(r)) / (float(p.sum()) / float(s.sum())))
            vp = 0.5 * (s + p / m)
            ok = vp > 0
            x = np.log(vp[ok]) / math.log(2); y = r[ok] / m - 1.0
            xc = x - x.mean()
            sxx = float((xc ** 2).sum())
            acc["prb"].append(float((xc * (y - y.mean())).sum()) / sxx if sxx else float("nan"))
            acc["mdape"].append(100.0 * float(np.median(np.abs(p - s) / s)))
    except ImportError:
        n = len(pairs)
        acc = {k: [] for k in ("median_ratio", "cod", "prd", "prb", "mdape")}
        for _ in range(min(b, 300)):
            sample = [pairs[random.randrange(n)] for _ in range(n)]
            mt = metrics(sample)
            for k in acc:
                acc[k].append(mt[k])
    out = {}
    for k, v in acc.items():
        v = sorted(v)
        out[k] = (v[int(len(v) * alpha / 2)], v[int(len(v) * (1 - alpha / 2)) - 1])
    return out


def fmt_block(name, pairs, with_ci=True):
    mt = metrics(pairs)
    cis = boot_cis(pairs) if with_ci else {}
    lines = [f"### {name}  (n={mt['n']:,})", ""]
    lines.append("| Metric | Value | 90% CI | IAAO standard | Pass |")
    lines.append("|---|---|---|---|---|")
    specs = [
        ("median_ratio", "Median ratio", "{:.3f}", (0.90, 1.10)),
        ("cod", "COD", "{:.1f}", (0, 15.0)),
        ("prd", "PRD", "{:.3f}", (0.98, 1.03)),
        ("prb", "PRB", "{:+.3f}", (-0.05, 0.05)),
        ("mdape", "MdAPE (%)", "{:.1f}", None),
    ]
    for key, label, f, std in specs:
        v = mt[key]
        ci = ""
        if with_ci:
            lo, hi = cis[key]
            ci = f"[{f.format(lo)}, {f.format(hi)}]"
        if std:
            ok = "✅" if std[0] <= v <= std[1] else "❌"
            std_s = f"{std[0]}–{std[1]}"
        else:
            ok, std_s = "—", "—"
        lines.append(f"| {label} | {f.format(v)} | {ci} | {std_s} | {ok} |")
    lines.append("")
    return lines, mt


def main():
    sales_csv, avm_csv, otr_csv, out_md = sys.argv[1:5]

    sales = {}
    for r in csv.DictReader(open(sales_csv)):
        sales[(r["ssl"], r["sale_date"])] = r

    otr = {}
    for r in csv.DictReader(open(otr_csv)):
        if r["assessment"] and float(r["assessment"]) > 0:
            otr[r["ssl"]] = float(r["assessment"])

    avm_pairs_all, avm_pairs_hold = [], []
    per_year, per_ward = defaultdict(list), defaultdict(list)
    otr_pairs_hold = []
    joint = []  # (avm_pred, otr_assessment, price) on holdout, for head-to-head

    for r in csv.DictReader(open(avm_csv)):
        key = (r["ssl"], r["sale_date"])
        s = sales.get(key)
        if not s:
            continue
        p, sp = float(r["predicted"]), float(r["sale_price"])
        pair = (p, sp)
        yr = r["sale_date"][:4]
        avm_pairs_all.append(pair)
        per_year[yr].append(pair)
        if yr >= "2025":
            avm_pairs_hold.append(pair)
            per_ward[s["ward"]].append(pair)
            a = otr.get(r["ssl"])
            if a:
                otr_pairs_hold.append((a, sp))
                joint.append((p, a, sp))

    out = ["# TerraValue AVM — IAAO Ratio Study (DC)", "",
           "**Date:** 2026-07-05 · **Predictions:** engine 1.3.0 `LandValuation.salesComparison`, "
           "k=5 nearest prior comps (≤365d lookback, leakage-free) · **Baseline:** OTR ASSESSMENT (layer 40, current TY).", ""]

    blk, _ = fmt_block("TerraValue AVM — 2025+ holdout (primary)", avm_pairs_hold)
    out += blk
    blk, _ = fmt_block("TerraValue AVM — all sales 2020–2026", avm_pairs_all)
    out += blk
    blk, _ = fmt_block("OTR assessment baseline — 2025+ holdout (same sales, where matched)", otr_pairs_hold)
    out += blk

    # Head-to-head on identical sales
    if joint:
        avm_j = metrics([(p, sp) for p, a, sp in joint])
        otr_j = metrics([(a, sp) for p, a, sp in joint])
        out += ["### Head-to-head (identical holdout sales, n={:,})".format(len(joint)), "",
                "| Metric | TerraValue AVM | OTR assessment |", "|---|---|---|"]
        for key, f in [("median_ratio", "{:.3f}"), ("cod", "{:.1f}"), ("prd", "{:.3f}"),
                       ("prb", "{:+.3f}"), ("mdape", "{:.1f}")]:
            out.append(f"| {key} | {f.format(avm_j[key])} | {f.format(otr_j[key])} |")
        out.append("")

    out += ["### AVM by sale year (comp-pool maturity check)", "",
            "| Year | n | Median ratio | COD | MdAPE |", "|---|---|---|---|---|"]
    for yr in sorted(per_year):
        mt = metrics(per_year[yr])
        out.append(f"| {yr} | {mt['n']:,} | {mt['median_ratio']:.3f} | {mt['cod']:.1f} | {mt['mdape']:.1f} |")
    out.append("")

    out += ["### AVM by ward — 2025+ holdout (spatial uniformity)", "",
            "| Ward | n | Median ratio | COD | MdAPE |", "|---|---|---|---|---|"]
    for w in sorted(per_ward, key=lambda x: (len(x), x)):
        mt = metrics(per_ward[w])
        out.append(f"| {w} | {mt['n']:,} | {mt['median_ratio']:.3f} | {mt['cod']:.1f} | {mt['mdape']:.1f} |")
    out.append("")

    out += ["### Caveats", "",
            "- OTR `ASSESSMENT` is the **current** tax-year value; ratios vs pre-2025 sales embed market movement, "
            "so the baseline is only quoted on the 2025+ holdout.",
            "- Engine time adjustment uses the **Atlanta** FHFA constant (3.8%/yr) — documented engine limitation, not patched.",
            "- AVM predictions are leakage-free (comps strictly before each subject's sale date) but the engine's "
            "adjustment coefficients are literature constants, not fit to DC — no training occurred, so no spatial CV is required; "
            "per-ward breakdown serves the uniformity check.", ""]

    with open(out_md, "w") as f:
        f.write("\n".join(out))
    print(f"wrote {out_md}")
    print("AVM holdout:", metrics(avm_pairs_hold))
    print("OTR holdout:", metrics(otr_pairs_hold))


if __name__ == "__main__":
    main()
