/**
 * TerraValue — lib/factors.js  (helper module for GET /api/factors?city=)
 * =====================================================================
 * Lives OUTSIDE /api so Vercel does not turn it into its own Serverless Function
 * (the vercel.json rewrite /api/(.*) → /api/index only applies to paths that
 * don't already match a function file). api/index.js requires this and merges
 * FACTORS_ROUTES into its dispatcher; @vercel/node bundles it via require-tracing.
 *
 * The live "confidence pull." Returns the Soil Score factors for a city from
 * authoritative sources so the public Soil Score view fills to more CITED
 * factors (higher confidence) than the hand-entered subset. The page fetches
 * this, drops the values into the form, then POSTs to /api/score.
 *
 * Strategy — augment, don't replace
 *   Each city carries its already-cited factors (canopy, park, + DC impervious).
 *   The pull ADDS walkability to every city and replaces PM2.5 with one uniform
 *   EPA source, so cross-city comparison stays on a single method/vintage.
 *
 *   - walkability ← EPA Smart Location DB / National Walkability Index (live, NO KEY)
 *   - PM2.5       ← EPA AQS annualData/byCBSA (live, needs AQS_EMAIL/AQS_KEY)
 *   - canopy/park/impervious ← cited registry values (EnviroAtlas uniformity = v2)
 *
 * Verified live 2026-06-16: SLD fields STATEFP/COUNTYFP/TotPop/NatWalkInd;
 * AQS CBSA-12060 annual mean = 10.2 µg/m³ over 4 valid monitors. MRLC NLCD
 * ImageServers 404'd → impervious stays a v2 add via EnviroAtlas L23 (see NOTES).
 *
 * Env: AQS_EMAIL, AQS_KEY (PM2.5 only — walkability needs neither). Optional
 * AQS_YEAR (default 2024; falls back to the prior year if not yet finalized).
 */

'use strict';

const AQS_PM25_PARAM = '88101';                  // EPA AQS PM2.5 (FRM/FEM mass)
const AQS_YEAR = Number(process.env.AQS_YEAR) || 2024;

// Uniform impervious source (v2). NLCD 2021 % developed imperviousness (USGS/MRLC),
// zonal mean over each city's land area (NLCD open water excluded), computed offline
// 2026-06-17 via MRLC GeoServer WCS over Census TIGER boundaries — see NOTES.
const NLCD_IMPERV_SRC = 'NLCD 2021 percent developed imperviousness (USGS/MRLC), mean over city land area';

const SLD_QUERY  = 'https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0/query';
const AQS_ANNUAL = 'https://aqs.epa.gov/data/api/annualData/byCBSA';

// Each city: census FIPS (state, county) for the SLD walk query, CBSA for AQS,
// and the factors we already sourced + cited (the pull augments these).
const CITY_REGISTRY = {
  atlanta: {
    label: 'Atlanta, GA', cbsa: '12060',
    counties: [{ state: '13', county: '121' }, { state: '13', county: '089' }], // Fulton, DeKalb
    cited: {
      canopyPct:     { value: 46.1, source: 'City of Atlanta Urban Tree Canopy Assessment, 2023' },
      parkAccessPct: { value: 82,   source: 'TPL ParkScore, 2025' },
      imperviousPct: { value: 32.5, source: NLCD_IMPERV_SRC },
    },
  },
  sandysprings: {
    label: 'Sandy Springs, GA', cbsa: '12060',
    counties: [{ state: '13', county: '121' }], // Fulton
    cited: {
      canopyPct:     { value: 54.5, source: 'Sandy Springs Tree Canopy Study Update, 2023' },
      parkAccessPct: { value: 28,   source: 'TPL ParkServe, 2024 (CityID 1368516)' },
      imperviousPct: { value: 22.7, source: NLCD_IMPERV_SRC },
    },
  },
  dc: {
    label: 'Washington, DC', cbsa: '47900',
    counties: [{ state: '11', county: '001' }], // District of Columbia
    cited: {
      canopyPct:     { value: 37, source: 'DC Urban Tree Canopy (DDOT/UFD), 2020' },
      parkAccessPct: { value: 99, source: 'TPL ParkScore, 2025' },
      imperviousPct: { value: 47.1, source: NLCD_IMPERV_SRC },
      annualPM25:    { value: 7.6, source: 'IQAir, 2024 (fallback if AQS unavailable)' },
    },
  },
  nyc: {
    label: 'New York City, NY', cbsa: '35620',
    // Manhattan(061) Brooklyn(047) Queens(081) Bronx(005) Staten Is.(085)
    counties: [{ state: '36', county: '061' }, { state: '36', county: '047' }, { state: '36', county: '081' }, { state: '36', county: '005' }, { state: '36', county: '085' }],
    cited: {
      canopyPct:     { value: 23.4, source: 'NYC LiDAR canopy assessment, 2021' },
      parkAccessPct: { value: 99,   source: 'TPL ParkScore, 2025' },
      annualPM25:    { value: 7.5,  source: 'IQAir, 2024 (fallback if AQS unavailable)' },
      imperviousPct: { value: 66.2, source: NLCD_IMPERV_SRC },
    },
  },
};

async function fetchJson(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, status: 502, error: `${e.name}: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ── WALKABILITY ───────────────────────────────────────────────────────────
// EPA SLD National Walkability Index (1–20), population-weighted over the
// city's county block groups (fields verified 2026-06-16). Paginates (ArcGIS
// caps at 1000 features/call). County-level is a metro-core proxy; city-precise
// boundary filtering is a v2 refinement (matters most for Sandy Springs).
async function walkabilityForCity(city) {
  const clause = city.counties
    .map((c) => `(STATEFP='${c.state}' AND COUNTYFP='${c.county}')`)
    .join(' OR ');

  let offset = 0, wsum = 0, psum = 0, guard = 0;
  while (guard++ < 25) {
    const url = `${SLD_QUERY}?where=${encodeURIComponent(clause)}`
      + `&outFields=${encodeURIComponent('NatWalkInd,TotPop')}`
      + `&returnGeometry=false&resultOffset=${offset}&resultRecordCount=1000&f=json`;
    const r = await fetchJson(url);
    if (!r.ok || !r.data || !Array.isArray(r.data.features) || r.data.features.length === 0) break;
    for (const f of r.data.features) {
      const a = f.attributes || {};
      const nwi = Number(a.NatWalkInd);
      const pop = Number(a.TotPop);
      if (Number.isFinite(nwi) && Number.isFinite(pop) && pop > 0) { wsum += nwi * pop; psum += pop; }
    }
    if (!r.data.exceededTransferLimit) break;
    offset += r.data.features.length;
  }
  if (psum === 0) return null;
  return {
    value: Math.round((wsum / psum) * 10) / 10,
    source: 'EPA Smart Location Database / National Walkability Index (2021), population-weighted across the city’s counties',
  };
}

// ── PM2.5 ──────────────────────────────────────────────────────────────────
// EPA AQS annual arithmetic-mean PM2.5 for the city's CBSA. The CBSA response
// is ~190 rows (monitors × durations × standards × event types + invalid
// partial-year rows); the real annual mean needs: validity 'Y', an annual
// pollutant standard, a single event_type, deduped by monitor. Filter verified
// against CBSA-12060 (→ 4 monitors, 10.2 µg/m³) on 2026-06-16.
async function aqsAnnualMean(city, year, email, key) {
  const url = `${AQS_ANNUAL}?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`
    + `&param=${AQS_PM25_PARAM}&bdate=${year}0101&edate=${year}1231&cbsa=${city.cbsa}`;
  const r = await fetchJson(url);
  if (!r.ok || !r.data || !Array.isArray(r.data.Data)) return null;

  const byMonitor = new Map();
  for (const d of r.data.Data) {
    if (!d || d.validity_indicator !== 'Y') continue;
    if (!d.pollutant_standard || !/Annual/i.test(d.pollutant_standard)) continue;
    if (d.event_type !== 'Events Included') continue;
    const mean = Number(d.arithmetic_mean);
    if (!Number.isFinite(mean)) continue;
    byMonitor.set(`${d.county_code}-${d.site_number}-${d.poc}`, mean); // dedupe multi-standard rows
  }
  const vals = [...byMonitor.values()];
  if (!vals.length) return null;
  return { mean: vals.reduce((a, b) => a + b, 0) / vals.length, monitors: vals.length, year };
}

async function pm25ForCity(city) {
  const email = process.env.AQS_EMAIL, key = process.env.AQS_KEY;
  if (!email || !key) return null; // not configured → omit (registry IQAir value, if any, stays)
  for (const year of [AQS_YEAR, AQS_YEAR - 1]) { // try configured year, fall back if not finalized
    const res = await aqsAnnualMean(city, year, email, key);
    if (res) return {
      value: Math.round(res.mean * 10) / 10,
      source: `EPA AQS annual mean PM2.5 (param 88101, annual standard, ${res.monitors} valid monitors, events included), CBSA ${city.cbsa}, ${res.year}`,
    };
  }
  return null;
}

// ── ORCHESTRATOR ──────────────────────────────────────────────────────────
async function buildFactors(cityId) {
  const city = CITY_REGISTRY[cityId];
  if (!city) {
    return { status: 404, body: { error: `Unknown city '${cityId}'`, available: Object.keys(CITY_REGISTRY) } };
  }

  const [walk, pm25] = await Promise.all([walkabilityForCity(city), pm25ForCity(city)]);

  const factors = {};
  const sources = {};
  for (const [k, c] of Object.entries(city.cited)) { factors[k] = c.value; sources[k] = c.source; }
  if (walk) { factors.walkabilityIndex = walk.value; sources.walkabilityIndex = walk.source; }
  if (pm25) { factors.annualPM25 = pm25.value; sources.annualPM25 = pm25.source; } // AQS overrides IQAir

  return {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=86400' },
    body: {
      city: city.label,
      factors,                              // POST straight to /api/score
      sources,                              // per-factor citation
      pulled: { walkability: !!walk, pm25: !!pm25 },
      route: '/api/factors',
    },
  };
}

async function handleFactors(_body, params) {
  const cityId = ((params && params.get('city')) || '').toLowerCase().trim();
  if (!cityId) return { status: 400, body: { error: 'Provide ?city=', available: Object.keys(CITY_REGISTRY) } };
  return buildFactors(cityId);
}

const FACTORS_ROUTES = { '/api/factors': { handler: handleFactors, method: 'GET' } };

module.exports = { FACTORS_ROUTES, CITY_REGISTRY, buildFactors, walkabilityForCity, pm25ForCity };

/* ── NOTES — provenance & v2 status ────────────────────────────────────────────
 * IMPERVIOUS (shipped 2026-06-17): imperviousPct above is NLCD 2021 % developed
 *   imperviousness (USGS/MRLC) — one uniform 2021 source/method across all 4 cities.
 *   Computed offline: MRLC GeoServer WCS (coverageId mrlc_display__NLCD_2021_Impervious_L48,
 *   outputCrs EPSG:5070) clipped to each city's Census TIGER boundary, masked to LAND
 *   (NLCD 2021 Land Cover, open-water class 11 excluded), pixel mean. Reproduce with
 *   drafts/imperv-zonal.py. Values: ATL 32.5, SS 22.7, DC 47.1, NYC 66.2 (inverse of
 *   canopy — a good sanity check). DC's prior lone 41% "2020 land-cover" value was
 *   retired so every city now shares one impervious method.
 *
 * EnviroAtlas REJECTED as the uniformity source (investigated 2026-06-17): of the 4
 *   pilots only DC + NYC are EnviroAtlas communities — Atlanta + Sandy Springs are not
 *   in Community_BGmetrics at all; the data is 2010-Census vintage (~2010–2011 land
 *   cover), breaking the strict 2020+ rule; and L41 "tree cover" is modeled FOREST
 *   (DC 24% vs cited UTC 37%), not comparable to the canopy studies; its park metric
 *   (% pop within 500 m of a park ENTRANCE) ≠ ParkScore's 10-min walk. Net: it would
 *   regress accuracy/vintage for the appearance of uniformity — not worth it. Service
 *   confirmed alive at enviroatlas.epa.gov/.../Communities/Community_BGmetrics if a
 *   future need arises (renderer fields: canopy MFor_P, park IWDP_Pct, imperv Imp_P).
 *
 * CANOPY/PARK stay on cited local sources (all already 2020+ and higher-res than
 *   NLCD 30 m / EnviroAtlas): city UTC/LiDAR canopy + TPL ParkScore/ParkServe.
 *
 * Still open (v2):
 * - Optional canopy uniformity via NLCD 2021 TCC (mrlc_display:nlcd_tcc_conus_2021_v2021-4,
 *   same WCS pipeline) — but local LiDAR/UTC is more accurate, so keep local unless a
 *   single method is mandated.
 * - Walkability city-precise: filter SLD block groups by the city boundary polygon
 *   (TIGER place) instead of whole counties (matters most for Sandy Springs).
 */
