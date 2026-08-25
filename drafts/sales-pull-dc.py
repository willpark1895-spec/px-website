#!/usr/bin/env python3
"""
TerraValue Track C — DC arms-length residential sales pull (IAAO ratio-study ground truth).

Assembles a geocoded, arms-length (QUALIFIED='Q'), 2020+ residential sales set for DC from
Open Data DC ArcGIS REST (no key required). stdlib only.

Sources (maps2.dcgis.dc.gov, DCGIS_DATA):
  - Property_and_Land_WebMercator/MapServer/57  PROPERTY SALES (CAMA)  — full sales history:
      SSL, SALE_DATE, SALE_PRICE, QUALIFIED ('Q' = qualified/arms-length, 'U' = unqualified), SALE_CODE
  - Property_and_Land_WebMercator/MapServer/25  RESIDENTIAL (CAMA)     — SF/rowhouse characteristics
      (membership in this table IS the residential filter; condos live in layer 24, not pulled here)
  - Location_WebMercator/MapServer/0            Address Points          — SSL -> LATITUDE/LONGITUDE/WARD

Join: sales.SSL -> residential.SSL (inner: residential-only) -> address point (first ACTIVE per SSL).

Output: CSV, one row per (SSL, sale_date, sale_price) sale event, plus a QA summary on stdout.

Usage:
  python3 sales-pull-dc.py --out dc_sales_residential_2020plus.csv [--since 2020-01-01]
  [--workers 6] [--cache-dir .cache_dc_pull]

Notes:
  - maxRecordCount=2000 per request; pages fetched in parallel by resultOffset
    (count first, then offsets), orderByFields=OBJECTID for stable paging.
  - Each source stage is cached as JSON in --cache-dir, so an interrupted run resumes
    where it left off (delete the cache dir for a fresh pull).
  - SSL strings are space-padded ('5809    0147'); joined on a whitespace-normalized key.
  - SALE_DATE is epoch ms (esriFieldTypeDate).
  - ~150 requests total. --workers 6 is polite-but-quick; don't crank it.
"""

import argparse, csv, json, os, sys, time
import urllib.parse, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

BASE = "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA"
SALES_URL = f"{BASE}/Property_and_Land_WebMercator/MapServer/57/query"
RES_URL   = f"{BASE}/Property_and_Land_WebMercator/MapServer/25/query"
ADDR_URL  = f"{BASE}/Location_WebMercator/MapServer/0/query"
PAGE = 2000


def fetch_json(url, params, tries=3):
    qs = urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{url}?{qs}", timeout=60) as r:
                d = json.loads(r.read().decode())
            if "error" in d:
                raise RuntimeError(f"ArcGIS error: {d['error']}")
            return d
        except Exception as e:
            if attempt == tries - 1:
                raise
            sys.stderr.write(f"  retry {attempt+1} after: {e}\n")
            time.sleep(3 * (attempt + 1))


def page_query(url, where, out_fields, label, workers=6, cache_dir=None):
    """Return list of attribute dicts across all pages (parallel by offset, cached)."""
    cache = os.path.join(cache_dir, f"{label}.json") if cache_dir else None
    if cache and os.path.exists(cache):
        with open(cache) as f:
            rows = json.load(f)
        sys.stderr.write(f"  {label}: {len(rows)} rows (cached)\n")
        return rows

    total = fetch_json(url, {"where": where, "returnCountOnly": "true",
                             "f": "json"})["count"]
    offsets = list(range(0, total, PAGE))

    def get_page(off):
        d = fetch_json(url, {
            "where": where, "outFields": out_fields, "returnGeometry": "false",
            "orderByFields": "OBJECTID", "resultOffset": off,
            "resultRecordCount": PAGE, "f": "json",
        })
        return [f["attributes"] for f in d.get("features", [])]

    rows = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for page in ex.map(get_page, offsets):
            rows.extend(page)
            sys.stderr.write(f"  {label}: {len(rows)}/{total}\r")
    sys.stderr.write(f"  {label}: {len(rows)} rows total (expected {total})\n")
    if cache:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cache, "w") as f:
            json.dump(rows, f)
    return rows


def norm_ssl(s):
    return " ".join((s or "").split())


def epoch_ms_to_date(ms):
    if ms is None:
        return None
    return time.strftime("%Y-%m-%d", time.gmtime(ms / 1000))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dc_sales_residential_2020plus.csv")
    ap.add_argument("--since", default="2020-01-01")
    ap.add_argument("--min-price", type=float, default=10000,
                    help="drop nominal-price rows that slipped past the Q flag")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--cache-dir", default=".cache_dc_pull")
    ap.add_argument("--stage-only", choices=["sales", "residential", "address"],
                    help="fetch just one stage into the cache, then exit")
    args = ap.parse_args()

    kw = dict(workers=args.workers, cache_dir=args.cache_dir)

    # 1) Qualified arms-length sales since --since
    where = (f"SALE_DATE >= DATE '{args.since}' AND QUALIFIED = 'Q' "
             f"AND SALE_PRICE >= {args.min_price}")
    if not args.stage_only or args.stage_only == "sales":
        sales = page_query(SALES_URL, where,
                           "SSL,SALE_DATE,SALE_PRICE,QUALIFIED,SALE_CODE", "sales(Q)", **kw)
        if args.stage_only:
            return

    # 2) Residential CAMA characteristics (this is the residential filter)
    res_fields = ("SSL,USECODE,GBA,LANDAREA,AYB,EYB,YR_RMDL,BEDRM,BATHRM,HF_BATHRM,"
                  "ROOMS,STORIES,NUM_UNITS,GRADE_D,CNDTN_D,STRUCT_D,STYLE_D,AC,FIREPLACES")
    if not args.stage_only or args.stage_only == "residential":
        res_rows = page_query(RES_URL, "1=1", res_fields, "residential", **kw)
        if args.stage_only:
            return
    res = {norm_ssl(a["SSL"]): a for a in res_rows}

    # 3) Address points: first ACTIVE point per SSL
    if not args.stage_only or args.stage_only == "address":
        addr_rows = page_query(ADDR_URL, "SSL IS NOT NULL AND STATUS = 'ACTIVE'",
                               "SSL,ADDRESS,LATITUDE,LONGITUDE,WARD", "address", **kw)
        if args.stage_only:
            return
    addr = {}
    for a in addr_rows:
        k = norm_ssl(a["SSL"])
        if k not in addr:
            addr[k] = a

    # Join + dedupe (repeat sales kept; exact-duplicate rows dropped)
    seen, rows = set(), []
    n_nonres = n_noaddr = 0
    for s in sales:
        k = norm_ssl(s["SSL"])
        r = res.get(k)
        if r is None:
            n_nonres += 1
            continue
        a = addr.get(k)
        if a is None:
            n_noaddr += 1
            continue
        date = epoch_ms_to_date(s["SALE_DATE"])
        key = (k, date, s["SALE_PRICE"])
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "ssl": k, "sale_date": date, "sale_price": s["SALE_PRICE"],
            "sale_code": s.get("SALE_CODE"),
            "usecode": r.get("USECODE"), "gba": r.get("GBA"),
            "landarea": r.get("LANDAREA"), "ayb": r.get("AYB"), "eyb": r.get("EYB"),
            "yr_rmdl": r.get("YR_RMDL"), "bedrm": r.get("BEDRM"),
            "bathrm": r.get("BATHRM"), "hf_bathrm": r.get("HF_BATHRM"),
            "rooms": r.get("ROOMS"), "stories": r.get("STORIES"),
            "num_units": r.get("NUM_UNITS"), "grade": r.get("GRADE_D"),
            "condition": r.get("CNDTN_D"), "struct": r.get("STRUCT_D"),
            "style": r.get("STYLE_D"), "ac": r.get("AC"),
            "fireplaces": r.get("FIREPLACES"),
            "address": a.get("ADDRESS"), "lat": a.get("LATITUDE"),
            "lon": a.get("LONGITUDE"), "ward": a.get("WARD"),
        })

    rows.sort(key=lambda r: (r["sale_date"], r["ssl"]))
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # QA summary
    print(f"\n=== DC residential arms-length sales pull — {time.strftime('%Y-%m-%d')} ===")
    print(f"Q-sales {args.since}+ pulled: {len(sales)}")
    print(f"  dropped non-residential (no L25 match, mostly condo/commercial): {n_nonres}")
    print(f"  dropped no address point: {n_noaddr}")
    print(f"  written (deduped): {len(rows)}  ->  {args.out}")
    by_year = Counter(r["sale_date"][:4] for r in rows)
    print("Per year:", dict(sorted(by_year.items())))
    by_ward = Counter(r["ward"] or "?" for r in rows)
    print("Per ward:", dict(sorted(by_ward.items())))
    prices = sorted(r["sale_price"] for r in rows)
    q = lambda p: prices[int(p * (len(prices) - 1))]
    print(f"Price quantiles: min {q(0):,.0f} | p05 {q(.05):,.0f} | median {q(.5):,.0f} "
          f"| p95 {q(.95):,.0f} | max {q(1):,.0f}")
    n_coords = sum(1 for r in rows if r["lat"] and r["lon"])
    print(f"Geocoded: {n_coords}/{len(rows)} ({100*n_coords/len(rows):.1f}%)")
    # IAAO: ward x year cell counts vs the 30-sales rule of thumb
    cells = defaultdict(int)
    for r in rows:
        cells[(r["ward"], r["sale_date"][:4])] += 1
    thin = {k: v for k, v in cells.items() if v < 30}
    print(f"Ward x year cells: {len(cells)}, under 30 sales: {len(thin)}"
          + (f" -> {thin}" if thin else ""))


if __name__ == "__main__":
    main()
