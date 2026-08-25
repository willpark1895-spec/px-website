#!/usr/bin/env python3
"""
OTR assessment pull — DC Owner Polygons layer 40 (Milestone A baseline).
Pulls SSL + ASSESSMENT for the SSLs in the sales ground-truth CSV.
Stdlib-only, batched (WHERE SSL IN (...)), stage-cached + resumable.

Caveat (document in results): ASSESSMENT is the CURRENT assessed value
(TY2026), not the assessment as of each historical sale year. Ratios
vs 2020-2024 sales embed market movement since the sale; the clean
baseline comparison is the 2025+ holdout, same as the AVM's test set.

Usage: python3 assessment-pull-dc.py <sales_csv> <out_csv>
"""
import csv, json, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = ("https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/"
       "Property_and_Land_WebMercator/MapServer/40/query")
BATCH = 100

def pad_ssl(s):
    """Normalized 'SQUARE LOT' -> layer-40 storage form: square(+suffix) ljust(8) + lot(4).
    Verified live 2026-07-05: SSL='0513 0933' matches only as '0513    0933'."""
    parts = s.split()
    if len(parts) == 2:
        return parts[0].ljust(8) + parts[1]
    if len(parts) == 3:  # square + suffix + lot
        return (parts[0] + parts[1]).ljust(8) + parts[2]
    return s

def fetch(ssls, tries=4):
    where = "SSL IN ({})".format(",".join("'{}'".format(pad_ssl(s).replace("'", "''")) for s in ssls))
    params = urllib.parse.urlencode({
        "where": where, "outFields": "SSL,ASSESSMENT,SALEPRICE,CLASSTYPE",
        "returnGeometry": "false", "f": "json"})
    for a in range(tries):
        try:
            with urllib.request.urlopen(URL + "?" + params, timeout=30) as r:
                d = json.load(r)
            if "features" in d:
                return [f["attributes"] for f in d["features"]]
        except Exception:
            pass
        time.sleep(1.5 * (a + 1))
    return None

def main():
    sales_csv, out_csv = sys.argv[1], sys.argv[2]
    ssls = sorted({row["ssl"] for row in csv.DictReader(open(sales_csv))})
    # normalize: layer 40 SSLs are space-padded like the sales layer; use raw + padded variants
    done = set()
    try:
        done = {r["ssl"] for r in csv.DictReader(open(out_csv))}
        print(f"resuming: {len(done)} already pulled")
        out = open(out_csv, "a", newline="")
        w = csv.writer(out)
    except FileNotFoundError:
        out = open(out_csv, "w", newline="")
        w = csv.writer(out)
        w.writerow(["ssl", "assessment", "layer40_saleprice", "classtype"])

    todo = [s for s in ssls if s not in done]
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    print(f"{len(todo)} SSLs to pull in {len(batches)} batches")
    norm = lambda s: " ".join(s.split())
    want = {norm(s): s for s in todo}
    n = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for res in ex.map(fetch, batches):
            if res is None:
                print("batch failed after retries — rerun to resume"); break
            for a in res:
                key = norm(a.get("SSL") or "")
                if key in want:
                    w.writerow([want[key], a.get("ASSESSMENT"), a.get("SALEPRICE"), a.get("CLASSTYPE")])
                    n += 1
            out.flush()
    print(f"wrote {n} assessment rows")

if __name__ == "__main__":
    main()
