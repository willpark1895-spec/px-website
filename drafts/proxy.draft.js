/**
 * TerraValue API — /api/proxy/*  (DRAFT — not wired into api/index.js yet)
 * =====================================================================
 * Purpose
 *   One server-side proxy + provider registry so the browser/form can pull
 *   parcel + environmental data WITHOUT hitting CORS, and so non-US cities
 *   plug in cleanly. Server-to-server requests are not subject to CORS, so
 *   the upstream's missing Access-Control-Allow-Origin no longer matters.
 *
 * Design
 *   - One canonical signal per concept: geocode, parcel, canopy, airQuality,
 *     soil, precip.  Each resolves to a PROVIDER chosen by JURISDICTION
 *     (country), with a 'global' fallback that works anywhere with OSM/OpenAQ.
 *   - "Major global cities with proper data access" => light up a premium
 *     adapter (Singapore, London, Amsterdam, Berlin, Barcelona, Paris, NYC…)
 *     where authoritative open data exists; fall back to the global baseline
 *     elsewhere.
 *
 * How to merge into api/index.js (small, reviewable):
 *   1. Add proxy routes to the ROUTES table:  Object.assign(ROUTES, PROXY_ROUTES)
 *   2. The current dispatcher calls route.handler(body). Proxy GETs need query
 *      params, so pass the parsed URL too:  route.handler(body, url.searchParams)
 *      (handlers below accept (params) where params is a URLSearchParams).
 *   3. Set env vars on Vercel: AIRNOW_API_KEY, OPENAQ_API_KEY, URA_ACCESS_KEY,
 *      ONEMAP_TOKEN (or ONEMAP_EMAIL/ONEMAP_PASSWORD to mint one).
 *
 * Provenance / TODO before production
 *   - NLCD MRLC ImageServer paths returned blocked-in-browser on 2026-06-15;
 *     confirm they still resolve server-side with `curl` (they reorganize).
 *   - OpenAQ is v3 + API key; OneMap/URA need a token. Endpoints marked //VERIFY.
 */

'use strict';

// ── Shared response headers ───────────────────────────────────────────────
const PROXY_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

/**
 * Fetch an upstream server-side and hand back a normalized envelope.
 * Adds a timeout, follows redirects, caches aggressively (federal/city data
 * is stable for months), and never leaks upstream errors as 500s.
 */
async function proxyFetch(url, opts = {}) {
  const {
    method = 'GET', headers = {}, body,
    timeoutMs = 8000, cacheSeconds = 86400, asText = false,
  } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, redirect: 'follow', signal: controller.signal });
    const payload = asText ? await res.text() : await res.json().catch(async () => ({ raw: await res.text() }));
    return {
      ok: res.ok,
      status: res.status,
      cacheSeconds,
      data: payload,
    };
  } catch (e) {
    return { ok: false, status: 502, error: `${e.name}: ${e.message}`, upstream: url };
  } finally {
    clearTimeout(timer);
  }
}

// Wrap a provider result in the API's {status, body} contract + cache header.
function proxyResult(providerOut, route) {
  const status = providerOut.ok ? 200 : (providerOut.status || 502);
  return {
    status,
    headers: { 'Cache-Control': `public, max-age=${providerOut.cacheSeconds || 3600}` },
    body: { ...providerOut, route },
  };
}

// ── Jurisdiction routing ──────────────────────────────────────────────────
// Crude ISO-country → provider-set map. In practice, resolve country from a
// reverse geocode (Nominatim) or an explicit ?country= param. 'global' is the
// universal fallback (OSM + OpenAQ + ESA WorldCover) that works anywhere.
const JURISDICTION_PROVIDERS = {
  US: 'us_federal',   // Census, NLCD, NOAA, PRISM, AirNow, EnviroAtlas
  SG: 'singapore',    // OneMap + URA + data.gov.sg (NEA, NParks)
  GB: 'uk',           // HM Land Registry + INSPIRE + OS; LAQN; London Datastore
  NL: 'netherlands',  // Kadaster BAG/BRK + PDOK; RIVM
  DE: 'germany',      // ALKIS (per-state, e.g. Berlin FIS-Broker) + Umweltatlas
  ES: 'spain',        // Catastro (OGC + REST)
  FR: 'france',       // API Carto cadastre (IGN/Étalab)
  // …extend per onboarded city/country…
};
function providerSetFor(country) {
  return JURISDICTION_PROVIDERS[(country || '').toUpperCase()] || 'global';
}

// ════════════════════════════════════════════════════════════════════════
//  PROVIDERS — one function per canonical signal, branching by jurisdiction
// ════════════════════════════════════════════════════════════════════════

// ---- GEOCODE: address → {lat, lon, country} ------------------------------
async function geocode(q, country) {
  const set = providerSetFor(country);
  if (set === 'singapore') {
    // OneMap search (no token needed for basic search). //VERIFY contract.
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y`;
    return proxyFetch(url);
  }
  if (set === 'us_federal') {
    // Census geocoder — CORS-blocked in browser, fine server-side.
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
    return proxyFetch(url);
  }
  // GLOBAL fallback: OSM Nominatim (be a good citizen: set a UA, ≤1 req/s).
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=1`;
  return proxyFetch(url, { headers: { 'User-Agent': 'TerraValue/1.0 (P&X; contact: pxconsulting.io)' } });
}

// ---- PARCEL: point/address → lot geometry, area, assessed/AV, use ---------
async function parcel(params, country) {
  const set = providerSetFor(country);
  switch (set) {
    case 'singapore':
      // URA Data Service needs a token minted from URA_ACCESS_KEY. //VERIFY paths.
      // 1) POST insertNewToken (AccessKey header) → token
      // 2) GET property/land-use service with token. OneMap planning-area polygon
      //    gives boundary; URA gives transactions + use.
      return { ok: false, status: 501, error: 'SG parcel adapter: wire URA token flow (URA_ACCESS_KEY) + OneMap planning area', provider: 'singapore' };
    case 'uk':
      // HM Land Registry: Price Paid (transactions) + INSPIRE Index Polygons
      // (freehold boundaries, England & Wales, open, monthly).
      return { ok: false, status: 501, error: 'UK parcel adapter: HMLR Price Paid + INSPIRE polygons', provider: 'uk' };
    case 'netherlands':
      // Kadaster BAG (addresses/buildings) + BRK (parcels) JSON REST via PDOK.
      return { ok: false, status: 501, error: 'NL parcel adapter: Kadaster BAG/BRK via PDOK OGC API', provider: 'netherlands' };
    case 'spain':
      // Catastro OGC/REST (Sede Electrónica del Catastro), 95% coverage.
      return { ok: false, status: 501, error: 'ES parcel adapter: Catastro INSPIRE OGC services', provider: 'spain' };
    case 'france':
      // API Carto "cadastre" module (IGN/Étalab), REST/OpenAPI.
      return { ok: false, status: 501, error: 'FR parcel adapter: API Carto cadastre module', provider: 'france' };
    case 'us_federal':
      // US has no national parcel layer — county assessor GIS or a vendor
      // (Regrid/ATTOM). Left to the parcel-store ingestion, not the live proxy.
      return { ok: false, status: 501, error: 'US parcels: use county GIS / Regrid / ATTOM in the ingestion layer', provider: 'us_federal' };
    default:
      // GLOBAL fallback: OSM building/landuse polygon via Overpass (coarse).
      return { ok: false, status: 501, error: 'No open parcel layer for this jurisdiction; OSM Overpass is the coarse fallback', provider: 'global' };
  }
}

// ---- AIR QUALITY: lat/lon → annual + current PM2.5/AQI -------------------
async function airQuality(lat, lon, country) {
  const set = providerSetFor(country);
  if (set === 'us_federal' && process.env.AIRNOW_API_KEY) {
    // AirNow is CORS-OK (could be called direct), but proxy to hide the key.
    const url = `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lon}&distance=25&API_KEY=${process.env.AIRNOW_API_KEY}`;
    return proxyFetch(url);
  }
  // GLOBAL baseline: OpenAQ (v3, API key). Aggregates government + sensor data
  // worldwide — the universal AQ source for non-US cities. //VERIFY v3 path.
  const headers = process.env.OPENAQ_API_KEY ? { 'X-API-Key': process.env.OPENAQ_API_KEY } : {};
  const url = `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=12000&limit=10`;
  return proxyFetch(url, { headers });
}

// ---- CANOPY: lat/lon → % tree cover --------------------------------------
async function canopy(lat, lon, country) {
  const set = providerSetFor(country);
  if (set === 'us_federal') {
    // NLCD USFS Tree Canopy ImageServer identify (Web Mercator point).
    // //VERIFY URL server-side — MRLC reorganizes these paths.
    const x = lon * 20037508.34 / 180;
    const y = (Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180)) * 20037508.34 / 180;
    const geom = encodeURIComponent(JSON.stringify({ x, y }));
    const url = `https://www.mrlc.gov/arcgis/rest/services/Tree_Canopy/USFS_NLCD_TCC_CONUS_All/ImageServer/identify?geometry=${geom}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`;
    return proxyFetch(url);
  }
  // GLOBAL baseline: ESA WorldCover (10m) or Meta/WRI 1m canopy height.
  // Both are raster — better served via a tiles/zonal-stats job than a live
  // point hit; expose here as a stub so the contract exists.
  return { ok: false, status: 501, error: 'Global canopy: ESA WorldCover / Meta-WRI 1m via zonal-stats job (precompute), not a live point call', provider: 'global' };
}

// ---- SOIL (US NRCS — CORS-OK, kept for completeness) ---------------------
async function soil(lat, lon, country) {
  if (providerSetFor(country) !== 'us_federal') {
    return { ok: false, status: 501, error: 'Soil adapter implemented for US (NRCS SSURGO) only so far', provider: 'global' };
  }
  // NRCS SDA is CORS-OK now (confirmed 2026-06-15) — could be called direct.
  const query =
    `SELECT TOP 1 muname, (SELECT TOP 1 slope_r FROM component WHERE mukey=m.mukey) AS slope ` +
    `FROM mapunit m WHERE mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})'))`;
  return proxyFetch('https://sdmdataaccess.nrcs.usda.gov/Tabular/SDMTabularService/post.rest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, format: 'JSON' }),
  });
}

// ════════════════════════════════════════════════════════════════════════
//  ROUTE HANDLERS  (return {status, headers, body} — same shape as index.js)
//  Each accepts a URLSearchParams `p` (see merge note #2 at top of file).
// ════════════════════════════════════════════════════════════════════════
async function handleGeocode(p)    { return proxyResult(await geocode(p.get('q') || p.get('address'), p.get('country')), '/api/proxy/geocode'); }
async function handleParcel(p)     { return proxyResult(await parcel(p, p.get('country')), '/api/proxy/parcel'); }
async function handleAirQuality(p) { return proxyResult(await airQuality(p.get('lat'), p.get('lon'), p.get('country')), '/api/proxy/airquality'); }
async function handleCanopy(p)     { return proxyResult(await canopy(p.get('lat'), p.get('lon'), p.get('country')), '/api/proxy/canopy'); }
async function handleSoil(p)       { return proxyResult(await soil(p.get('lat'), p.get('lon'), p.get('country')), '/api/proxy/soil'); }

// ── ROUTES fragment to merge into api/index.js ────────────────────────────
const PROXY_ROUTES = {
  '/api/proxy/geocode':    { handler: handleGeocode,    method: 'GET' },
  '/api/proxy/parcel':     { handler: handleParcel,     method: 'GET' },
  '/api/proxy/airquality': { handler: handleAirQuality, method: 'GET' },
  '/api/proxy/canopy':     { handler: handleCanopy,     method: 'GET' },
  '/api/proxy/soil':       { handler: handleSoil,       method: 'GET' },
};

module.exports = { PROXY_ROUTES, PROXY_CORS, proxyFetch, geocode, parcel, airQuality, canopy, soil, providerSetFor };
