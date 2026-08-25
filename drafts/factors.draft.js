/**
 * TerraValue API — GET /api/factors?city=<id>   (DRAFT — not wired into api/index.js yet)
 * =====================================================================
 * Purpose
 *   The live "confidence pull." Returns the Soil Score factors for a city from
 *   authoritative sources so the public Soil Score view fills to more CITED
 *   factors (higher confidence) than the hand-entered subset. The page fetches
 *   this, drops the values into the form, then POSTs to /api/score.
 *
 * Strategy — augment, don't replace
 *   Each city carries its already-cited factors (canopy, park, + DC impervious,
 *   + DC/NYC PM2.5). The pull ADDS walkability to every city and (when the AQS
 *   key is set) upgrades PM2.5 to a single uniform EPA source.
 *
 * Confidence lift (canopy .30 + park .20 + walk .15 + PM2.5 .20 + imperv .15):
 *   - walkability ← EPA Smart Location DB / National Walkability Index (live, NO KEY)
 *       → DC & NYC reach HIGH; Atlanta & Sandy Springs reach MODERATE — no key needed.
 *   - PM2.5 (AQS) ← EPA AQS annualData/byCBSA (live, needs AQS_EMAIL/AQS_KEY)
 *       → adds Atlanta & Sandy Springs' missing factor (→ HIGH) and makes PM2.5 uniform.
 *
 * Endpoint gate (laptop curl, 2026-06-16)
 *   ✅ Census geocoder · ✅ EPA SLD WalkabilityIndex · ✅ EnviroAtlas BGmetrics
 *   ❌ MRLC NLCD TCC + impervious ImageServers → 404 (reorganized) → NLCD off the
 *      critical path; impervious is a v2 add via EnviroAtlas L23 (see NOTES).
 *   SLD fields CONFIRMED: STATEFP, COUNTYFP, TotPop ("Population, 2018"), NatWalkInd.
 *
 * Wire into api/index.js (small, reviewable):
 *   1. const { FACTORS_ROUTES } = require('./factors.draft');
 *      Object.assign(ROUTES, FACTORS_ROUTES);
 *   2. GET /api/factors needs the query string. Change the dispatcher line
 *          const result = await route.handler(body);
 *      to
 *          const result = await route.handler(body, url.searchParams);
 *      (POST handlers ignore the 2nd arg.)
 *   3. Vercel env vars (for the PM2.5 upgrade only): AQS_EMAIL, AQS_KEY.
 *      Walkability needs no key, so v1 ships fine without them.
 */

'use strict';

const AQS_PM25_PARAM = '88101';                     // EPA AQS PM2.5 (FRM/FEM mass)
const AQS_YEAR = process.env.AQS_YEAR || '2024';    // //VERIFY 2024 finalized in AQS; else 2023

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
    },
  },
  sandysprings: {
    label: 'Sandy Springs, GA', cbsa: '12060',
    counties: [{ state: '13', county: '121' }], // Fulton
    cited: {
      canopyPct:     { value: 54.5, source: 'Sandy Springs Tree Canopy Study Update, 2023' },
      parkAccessPct: { value: 28,   source: 'TPL ParkServe, 2024 (CityID 1368516)' },
    },
  },
  dc: {
    label: 'Washington, DC', cbsa: '47900',
    counties: [{ state: '11', county: '001' }], // District of Columbia
    cited: {
      canopyPct:     { value: 37,  source: 'DC Urban Tree Canopy (DDOT/UFD), 2020' },
      parkAccessPct: { value: 99,  source: 'TPL ParkScore, 2025' },
      imperviousPct: { value: 41,  source: 'DC land-cover assessment, 2020' },
      annualPM25:    { value: 7.6, source: 'IQAir, 2024 (AQS upgrade pending key)' },
    },
  },
  nyc: {
    label: 'New York City, NY', cbsa: '35620',
    // Manhattan(061) Brooklyn(047) Queens(081) Bronx(005) Staten Is.(085)
    counties: [{ state: '36', county: '061' }, { state: '36', county: '047' }, { state: '36', county: '081' }, { state: '36', county: '005' }, { state: '36', county: '085' }],
    cited: {
      canopyPct:     { value: 23.4, source: 'NYC LiDAR canopy assessment, 2021' },
      parkAccessPct: { value: 99,   source: 'TPL ParkScore, 2025' },
      annualPM25:    { value: 7.5,  source: 'IQAir, 2024 (AQS upgrade pending key)' },
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
// city's county block groups. Fields confirmed via the 2026-06-16 gate curl.
// Paginates (ArcGIS caps at 1000 features/call).
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
    // county-level is a metro-core proxy; city-precise BG filtering is a v2 refinement
    source: 'EPA Smart Location Database / National Walkability Index (2021), population-weighted across the city’s counties',
  };
}

// ── PM2.5 (upgrade) ────────────────────────────────────────────────────────
// EPA AQS annual arithmetic-mean PM2.5 for the city's CBSA. Returns null if no
// key is configured (so v1 ships walkability-only without it).
async function pm25ForCity(city) {
  const email = process.env.AQS_EMAIL, key = process.env.AQS_KEY;
  if (!email || !key) return null;
  const url = `${AQS_ANNUAL}?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`
    + `&param=${AQS_PM25_PARAM}&bdate=${AQS_YEAR}0101&edate=${AQS_YEAR}1231&cbsa=${city.cbsa}`;
  const r = await fetchJson(url);
  if (!r.ok || !r.data || !Array.isArray(r.data.Data)) return null;

  // AQS returns ~190 rows per CBSA (monitors × durations × pollutant standards ×
  // event types, plus invalid partial-year rows). For a representative annual mean:
  //   - validity_indicator === 'Y'        drop partial-year / invalid monitors
  //   - pollutant_standard matches /Annual/  the annual-mean rows (not 1-/24-hour)
  //   - event_type === 'Events Included'  as-measured air; pick ONE to avoid 3× dup
  //   - dedupe by monitor (county+site+poc) so multi-standard rows don't double-count
  // Confirmed against the live CBSA-12060 response, 2026-06-16.
  const byMonitor = new Map();
  for (const d of r.data.Data) {
    if (!d || d.validity_indicator !== 'Y') continue;
    if (!d.pollutant_standard || !/Annual/i.test(d.pollutant_standard)) continue;
    if (d.event_type !== 'Events Included') continue;
    const mean = Number(d.arithmetic_mean);
    if (!Number.isFinite(mean)) continue;
    byMonitor.set(`${d.county_code}-${d.site_number}-${d.poc}`, mean);
  }
  const vals = [...byMonitor.values()];
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    value: Math.round(avg * 10) / 10,
    source: `EPA AQS annual mean PM2.5 (param 88101, annual standard, valid monitors, events included), CBSA ${city.cbsa}, ${AQS_YEAR}`,
  };
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

/* ── NOTES — v2 (uniformity + impervious), after v1 ────────────────────────────
 * - EnviroAtlas Community_BGmetrics (CORS-OK, alive) is the one-call source for
 *   canopy (L41), park access (L35), impervious (L23) at block-group grain, for
 *   cities that are EnviroAtlas communities (confirm which of the 4 via an identify
 *   on layer 41). Swapping canopy/park to it = one uniform vintage/method + adds
 *   impervious → coverage 1.0. Sandy Springs (likely not a community) keeps the
 *   cited local canopy + ParkServe park.
 * - Walkability is county-level here (metro-core proxy). City-precise = filter BGs
 *   by the city boundary polygon (spatial query) or a city→GEOID crosswalk; matters
 *   most for Sandy Springs (shares Fulton County with Atlanta).
 * - Impervious via NLCD needs the relocated MRLC ImageServer URL (old paths 404'd)
 *   + computeStatisticsHistograms over the city polygon; defer to v2.
 * - terravalue/index.html: change the city picker from the static CITIES map to
 *   on-pick → GET /api/factors?city= → fill fields → POST /api/score. Keep the
 *   static values as a fallback if /api/factors is unavailable.
 */
