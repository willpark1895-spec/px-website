#!/usr/bin/env node
/**
 * TerraValue AVM backtest — DC sales (Milestone A, 2026-07-05)
 * ============================================================
 * Runs the SHIPPED engine (terravalue-engine 1.3.0, LandValuation.salesComparison)
 * over the 24k DC arms-length sales to produce leakage-free predictions for the
 * IAAO ratio study. DRAFT — lives in drafts/, nothing wired into the API.
 *
 * Design (audit-honest):
 *  - Prediction for each sale uses ONLY comps sold strictly BEFORE the subject's
 *    sale date, within a LOOKBACK_DAYS window — no future information.
 *  - Comps: k nearest by haversine distance among the same structural class
 *    (usecode group: 11/12/13 single-family-ish vs 23/24/25 multi/conversion),
 *    excluding the subject SSL entirely (repeat sales of the same parcel are
 *    trivially self-predicting).
 *  - Engine quirks handled HERE, engine untouched:
 *      (a) time adjustment anchors to Date.now() → we shift each comp saleDate
 *          by (now - subjectDate) so the engine's elapsed-months equals the true
 *          comp→subject interval. Engine's appreciation constant is Atlanta FHFA
 *          3.8%/yr — documented limitation, NOT patched.
 *      (b) single-comp weight bug (indicatedValue=0) → require >= MIN_COMPS.
 *  - Stage-cached + resumable: appends to the output CSV, skips rows already done.
 *
 * Usage: node avm-predict-dc.js <sales_csv> <out_csv> [--limit N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const T = require(path.join(__dirname, '..', '..', 'terravalue-engine', 'lib', 'terravalue-engine.js'));

const K_COMPS = 5;
const MIN_COMPS = 2;              // engine returns 0 with exactly 1 comp
const LOOKBACK_DAYS = 365;
const CELL_DEG = 0.01;            // ~1.1 km grid for neighbor search

const CONDITION_MAP = { 'Poor': 1, 'Fair': 2, 'Average': 3, 'Good': 4, 'Very Good': 5, 'Excellent': 6 };
const SF_GROUP = new Set(['11.0', '12.0', '13.0', '15.0']);  // detached/row/semi
// group key: 'sf' vs 'mf' (23/24/25 conversions & small multifamily)
const groupOf = (usecode) => (SF_GROUP.has(usecode) ? 'sf' : 'mf');

function parseCsv(text) {
  // No quoted commas in this dataset except address — handle quotes minimally.
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    const o = {};
    header.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * d / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function main() {
  const [salesCsv, outCsv] = process.argv.slice(2);
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
  if (!salesCsv || !outCsv) { console.error('usage: node avm-predict-dc.js <sales_csv> <out_csv> [--limit N]'); process.exit(1); }

  const rows = parseCsv(fs.readFileSync(salesCsv, 'utf8')).map((r, i) => ({
    idx: i,
    ssl: r.ssl.trim(),
    date: new Date(r.sale_date + 'T00:00:00Z'),
    dateStr: r.sale_date,
    price: +r.sale_price,
    group: groupOf(r.usecode),
    gba: +r.gba || null,
    landarea: +r.landarea || null,
    ayb: +r.ayb || null,
    cond: CONDITION_MAP[r.condition] || null,
    lat: +r.lat, lon: +r.lon,
    ward: r.ward,
  })).filter(r => r.price > 0 && r.lat && r.lon);
  rows.sort((a, b) => a.date - b.date);

  // Spatial grid per group for fast neighbor lookup
  const grid = { sf: new Map(), mf: new Map() };
  const cellKey = (lat, lon) => `${Math.floor(lat / CELL_DEG)}:${Math.floor(lon / CELL_DEG)}`;
  for (const r of rows) {
    const k = cellKey(r.lat, r.lon);
    const g = grid[r.group];
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);  // rows are date-sorted, so cell lists are too
  }

  // Resume support
  const done = new Set();
  if (fs.existsSync(outCsv)) {
    for (const line of fs.readFileSync(outCsv, 'utf8').trim().split('\n').slice(1)) {
      if (line) done.add(line.split(',')[0] + '|' + line.split(',')[1]);
    }
    console.log(`resuming: ${done.size} rows already predicted`);
  } else {
    fs.writeFileSync(outCsv, 'ssl,sale_date,sale_price,predicted,n_comps,median_comp_km,engine_confidence,max_adj_pct\n');
  }

  const NOW = Date.now();
  let written = 0, skippedNoComps = 0;
  const buf = [];

  for (const subj of rows) {
    if (written + skippedNoComps >= limit) break;
    const key = subj.ssl + '|' + subj.dateStr;
    if (done.has(key)) continue;

    // Gather candidates from expanding rings of grid cells until >= K found
    const minDate = subj.date.getTime() - LOOKBACK_DAYS * 86400e3;
    const ci = Math.floor(subj.lat / CELL_DEG), cj = Math.floor(subj.lon / CELL_DEG);
    let cands = [];
    for (let ring = 0; ring <= 8; ring++) {          // up to ~9 km
      for (let di = -ring; di <= ring; di++) {
        for (let dj = -ring; dj <= ring; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const cell = grid[subj.group].get(`${ci + di}:${cj + dj}`);
          if (!cell) continue;
          for (const c of cell) {
            if (c.date.getTime() >= subj.date.getTime()) break; // date-sorted: rest are later
            if (c.date.getTime() < minDate || c.ssl === subj.ssl) continue;
            cands.push(c);
          }
        }
      }
      if (cands.length >= K_COMPS * 3 && ring >= 1) break;  // enough + full ring beyond nearest
    }
    if (cands.length < MIN_COMPS) { skippedNoComps++; continue; }

    cands.forEach(c => { c._d = haversineKm(subj.lat, subj.lon, c.lat, c.lon); });
    cands.sort((a, b) => a._d - b._d);
    const comps = cands.slice(0, K_COMPS);

    // Engine call. saleDate shift: engine measures elapsed time from NOW;
    // we want elapsed = subj.date - comp.date, so present comp as if it sold
    // (subj.date - comp.date) before NOW.
    const engineComps = comps.map(c => ({
      salePrice: c.price,
      saleDate: new Date(NOW - (subj.date.getTime() - c.date.getTime())).toISOString(),
      lotSizeSqFt: c.landarea,
      yearBuilt: c.ayb,
      condition: c.cond,
      buildingSqFt: c.gba,
      address: c.ssl,
    }));
    const subject = { lotSizeSqFt: subj.landarea, yearBuilt: subj.ayb, condition: subj.cond, buildingSqFt: subj.gba };

    let res;
    try { res = T.LandValuation.salesComparison(subject, engineComps); }
    catch (e) { skippedNoComps++; continue; }
    if (!res || !res.indicatedValue) { skippedNoComps++; continue; }

    const dists = comps.map(c => c._d).sort((a, b) => a - b);
    const medKm = dists[Math.floor(dists.length / 2)];
    const maxAdj = Math.max(...res.adjustedComparables.map(c => Math.abs(c.totalAdjustmentPct)));
    buf.push([subj.ssl, subj.dateStr, subj.price, res.indicatedValue, comps.length,
      medKm.toFixed(3), res.confidence, maxAdj.toFixed(2)].join(','));
    written++;
    if (buf.length >= 2000) { fs.appendFileSync(outCsv, buf.join('\n') + '\n'); buf.length = 0; }
  }
  if (buf.length) fs.appendFileSync(outCsv, buf.join('\n') + '\n');
  console.log(`done: wrote ${written} predictions, skipped ${skippedNoComps} (insufficient comps)`);
}

main();
