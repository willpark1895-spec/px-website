#!/usr/bin/env python3
"""
TerraValue — Successional Valuation Model, Layer 1 prototype (DC).

Descriptive succession mapping: for each DC block group, measure NLCD impervious
across 9 vintages (2001-2021), classify each (block group, vintage) into a
development-intensity successional stage, and compute the observed stage-to-stage
Markov transition matrix. Pure description of what happened — no projection.

Pipeline (extends drafts/imperv-zonal.py from per-city to per-block-group, over time):
  - Block groups: Census TIGERweb 2020, DC (STATE=11), geometry in EPSG:5070 (Albers, equal-area).
  - Impervious + Land Cover: MRLC GeoServer WCS, one DC-wide clip per vintage, outputCrs=5070.
  - Zonal mean impervious over LAND pixels only (NLCD nodata=255 and open-water class 11 excluded),
    matching the shipped v2 city method.
  - Stage by impervious %: S1 Undeveloped <5 | S2 Emerging 5-20 | S3 Established 20-40
    | S4 Urban 40-60 | S5 Dense core >=60.

Deps: rasterio, rasterstats, numpy (pip install --break-system-packages).
Outputs (to --outdir):
  dc_bg_impervious_by_vintage.csv   — geoid x vintage impervious means + stage
  dc_succession_transition_2001_2021.csv — 5x5 transition matrix (counts + row-normalized prob)
  prints a QA/summary block.

Usage: python3 succession-map-dc.py --outdir OUT [--cache /tmp/succ_dc]
"""

import argparse, csv, json, os, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np

TIGER = ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
         "tigerWMS_Census2020/MapServer/8/query")
WCS = "https://www.mrlc.gov/geoserver/ows"
VINTAGES = [2001, 2004, 2006, 2008, 2011, 2013, 2016, 2019, 2021]
# DC bounding box in native EPSG:3857 (padded from TIGERweb extent), for the WCS subset
BBOX_3857 = (-8585500, 4691300, -8560900, 4721700)
STAGES = [(0, 5, "S1_Undeveloped"), (5, 20, "S2_Emerging"), (20, 40, "S3_Established"),
          (40, 60, "S4_Urban"), (60, 101, "S5_DenseCore")]
STAGE_NAMES = [s[2] for s in STAGES]


def stage_of(pct):
    if pct is None or np.isnan(pct):
        return None
    for lo, hi, name in STAGES:
        if lo <= pct < hi:
            return name
    return STAGE_NAMES[-1]


def get_block_groups(cache):
    path = os.path.join(cache, "dc_bg_5070.geojson")
    if not os.path.exists(path):
        p = {"where": "STATE='11'", "outFields": "GEOID", "returnGeometry": "true",
             "outSR": "5070", "f": "geojson"}
        gj = json.loads(urllib.request.urlopen(f"{TIGER}?{urllib.parse.urlencode(p)}",
                                               timeout=120).read())
        json.dump(gj, open(path, "w"))
    return json.load(open(path))["features"]


def wcs_url(coverage):
    x0, y0, x1, y1 = BBOX_3857
    q = (f"service=WCS&version=2.0.1&request=GetCoverage&coverageId={coverage}"
         f"&format=image/geotiff&outputCrs=EPSG:5070"
         f"&subset=X({x0},{x1})&subset=Y({y0},{y1})")
    return f"{WCS}?{q}"


def download_rasters(cache):
    """One impervious + one land-cover clip per vintage, cached."""
    jobs = []
    for yr in VINTAGES:
        jobs.append((f"imp_{yr}.tif", f"mrlc_display__NLCD_{yr}_Impervious_L48"))
        jobs.append((f"lc_{yr}.tif", f"mrlc_display__NLCD_{yr}_Land_Cover_L48"))

    def fetch(job):
        fn, cov = job
        path = os.path.join(cache, fn)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            return f"{fn} cached"
        urllib.request.urlretrieve(wcs_url(cov), path)
        return f"{fn} {os.path.getsize(path)}B"

    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(fetch, jobs):
            sys.stderr.write(f"  {r}\n")


def zonal_land_impervious(feats, imp_path, lc_path):
    """Mean impervious over land pixels (excl nodata 255 and water class 11), per block group."""
    import rasterio
    from rasterstats import zonal_stats
    with rasterio.open(imp_path) as ri, rasterio.open(lc_path) as rl:
        imp = ri.read(1).astype("float32")
        lc = rl.read(1)
        aff = ri.transform
        # land mask: valid impervious AND not open water
        masked = np.where((imp != 255) & (lc != 11), imp, np.nan)
    zs = zonal_stats(feats, masked, affine=aff, stats=["mean", "count"], nodata=np.nan)
    return zs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--cache", default="/tmp/succ_dc")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(args.outdir, exist_ok=True)

    feats = get_block_groups(args.cache)
    geoids = [f["properties"]["GEOID"] for f in feats]
    sys.stderr.write(f"block groups: {len(feats)}\n")
    download_rasters(args.cache)

    # impervious mean per bg per vintage
    imp = {yr: {} for yr in VINTAGES}   # yr -> geoid -> pct
    for yr in VINTAGES:
        zs = zonal_land_impervious(feats,
                                   os.path.join(args.cache, f"imp_{yr}.tif"),
                                   os.path.join(args.cache, f"lc_{yr}.tif"))
        for gid, z in zip(geoids, zs):
            imp[yr][gid] = z["mean"]
        vals = [z["mean"] for z in zs if z["mean"] is not None]
        sys.stderr.write(f"  {yr}: median bg impervious {np.median(vals):.1f}  "
                         f"(n={len(vals)})\n")

    # wide CSV: geoid, imp_2001..imp_2021, stage_2001, stage_2021
    wide_path = os.path.join(args.outdir, "dc_bg_impervious_by_vintage.csv")
    with open(wide_path, "w", newline="") as f:
        cols = ["geoid"] + [f"imp_{y}" for y in VINTAGES] + ["stage_2001", "stage_2021",
                "imp_change_01_21", "stage_change"]
        w = csv.writer(f)
        w.writerow(cols)
        for gid in geoids:
            row = [gid] + [None if imp[y][gid] is None else round(imp[y][gid], 2)
                           for y in VINTAGES]
            s01, s21 = stage_of(imp[2001][gid]), stage_of(imp[2021][gid])
            chg = (None if imp[2001][gid] is None or imp[2021][gid] is None
                   else round(imp[2021][gid] - imp[2001][gid], 2))
            sc = (None if s01 is None or s21 is None else
                  STAGE_NAMES.index(s21) - STAGE_NAMES.index(s01))
            w.writerow(row + [s01, s21, chg, sc])

    # transition matrix 2001 -> 2021
    idx = {n: i for i, n in enumerate(STAGE_NAMES)}
    M = np.zeros((5, 5), dtype=int)
    for gid in geoids:
        s01, s21 = stage_of(imp[2001][gid]), stage_of(imp[2021][gid])
        if s01 and s21:
            M[idx[s01], idx[s21]] += 1
    tm_path = os.path.join(args.outdir, "dc_succession_transition_2001_2021.csv")
    with open(tm_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["from\\to"] + STAGE_NAMES + ["row_total"])
        for i, name in enumerate(STAGE_NAMES):
            tot = M[i].sum()
            w.writerow([name] + list(M[i]) + [tot])
        w.writerow([])
        w.writerow(["row-normalized P(to | from)"])
        w.writerow(["from\\to"] + STAGE_NAMES)
        for i, name in enumerate(STAGE_NAMES):
            tot = M[i].sum()
            probs = [round(M[i, j] / tot, 3) if tot else 0 for j in range(5)]
            w.writerow([name] + probs)

    # summary
    print(f"\n=== DC succession mapping (NLCD impervious 2001->2021) ===")
    print(f"block groups classified: {int(M.sum())}")
    dist01 = {n: 0 for n in STAGE_NAMES}
    dist21 = {n: 0 for n in STAGE_NAMES}
    for gid in geoids:
        s01, s21 = stage_of(imp[2001][gid]), stage_of(imp[2021][gid])
        if s01: dist01[s01] += 1
        if s21: dist21[s21] += 1
    print("stage distribution 2001:", dist01)
    print("stage distribution 2021:", dist21)
    ups = downs = same = 0
    for gid in geoids:
        s01, s21 = stage_of(imp[2001][gid]), stage_of(imp[2021][gid])
        if s01 and s21:
            d = STAGE_NAMES.index(s21) - STAGE_NAMES.index(s01)
            ups += d > 0; downs += d < 0; same += d == 0
    print(f"transitions: advanced {ups} | regressed {downs} | stable {same}")
    med01 = np.median([imp[2001][g] for g in geoids if imp[2001][g] is not None])
    med21 = np.median([imp[2021][g] for g in geoids if imp[2021][g] is not None])
    print(f"citywide median bg impervious: 2001 {med01:.1f}% -> 2021 {med21:.1f}%")
    # biggest densifiers
    gains = sorted(((imp[2021][g] - imp[2001][g], g) for g in geoids
                    if imp[2001][g] is not None and imp[2021][g] is not None),
                   reverse=True)[:5]
    print("top densifying block groups (impervious gain pp):",
          [(g, round(d, 1)) for d, g in gains])
    print(f"\nwrote:\n  {wide_path}\n  {tm_path}")


if __name__ == "__main__":
    main()
