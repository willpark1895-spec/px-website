/**
 * TerraValue — lib/parcel.js   (helper module for GET /api/parcel?address=)
 * =============================================================================
 * Lives OUTSIDE /api so Vercel does not turn it into its own Serverless Function
 * — same reason as lib/factors.js. api/index.js requires this and merges
 * PARCEL_ROUTES into its dispatcher; @vercel/node bundles it via require-tracing.
 *
 * M4 (partial): make the MVP calculator populate from a real Fulton County
 * parcel so the page stops shipping demo values.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ADDRESS-FIRST AND NOT POINT-IN-POLYGON
 * ─────────────────────────────────────────────────────────────────────────────
 * The 2026-08-26 session spec called for: geocode the address, then a
 * point-in-polygon query against Fulton CE_Parcels/0. That was measured on
 * 2026-08-25 against 18 real Fulton single-family parcels with known ground
 * truth (the parcel's own geometry), and it does not work:
 *
 *     point-in-polygon on a Census-geocoded point ......  0 / 18
 *     AddrNumber + Address match .......................  17 / 18, 0 wrong
 *
 * Cause is structural, not a bug: the Census one-line geocoder interpolates
 * along the TIGER street CENTERLINE, and road right-of-way is not inside any
 * tax parcel. Observed offset from the true parcel centroid: 70–400 ft.
 * (The spatial query itself is fine — round-tripping a parcel's own centroid
 * back through it returns that parcel in 0.7 s. It is the POINT that is wrong.)
 *
 * The dangerous half is not the misses, it is the hits: buffering the point by
 * 50 ft to "fix" the misses returned a 35-acre neighbouring tract appraised at
 * $61.8M for 7840 Roswell Rd — the wrong parcel, silently, no error, no NaN.
 * That is the same failure shape as the 40% trap below, and the audit exists to
 * eliminate exactly this class. So:
 *
 *     The ADDRESS is the primary key. The COORDINATE is only a tiebreaker
 *     for multi-unit hits, and a match is never returned uncorroborated.
 *
 * A useful consequence: the geocoder leaves the critical path entirely. Canopy
 * is then sampled at the MATCHED PARCEL's centroid — strictly more accurate
 * than sampling at a geocoded guess.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE 40% TRAP  (O.C.G.A. § 48-5-7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Georgia assesses at 40% of fair market value. Fulton publishes both:
 *     TotAppr / LandAppr / ImprAppr  = APPRAISED (fair market value)  ← use
 *     TotAssess / LandAssess / ImprAssess = ASSESSED (40% of FMV)
 * The engine's `assessedValue` input expects FAIR MARKET VALUE. Wiring
 * TotAssess in by mistake runs every valuation 60% low while looking entirely
 * plausible — no error, no NaN, no test failure. This module returns TotAppr,
 * never TotAssess, and SHOWS ITS WORK: every response carries
 * `checks.assessmentRatio` (observed TotAssess/TotAppr) so a reviewer can see
 * the relationship held on the actual parcel served. Verified exactly 0.4000 on
 * 13 live parcels, 2026-08-25.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT PUBLISHED — DO NOT FAKE IT
 * ─────────────────────────────────────────────────────────────────────────────
 * Fulton publishes no buildingSqFt and no yearBuilt (no such field among the 35).
 * DeKalb declares them and they are empty on 0 of 246,055. They are therefore
 * reported in `unavailable[]`, ALWAYS, and never given a default. A lookup that
 * openly says a field is not public is more credible than one that silently
 * substitutes a demo value.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENDPOINT NOTES (gated live 2026-08-25)
 * ─────────────────────────────────────────────────────────────────────────────
 * - Fulton CE_Parcels/0: 373,307 features, layer SR wkid 102667 (NAD83 Georgia
 *   West ftUS). Pass outSR=4326 and the server reprojects output to lat/lon, so
 *   no projection library is needed here. Address queries measured 0.27–0.86 s;
 *   the server resets connections when hit fast, hence sequential + retry.
 * - Canopy: the MRLC ArcGIS ImageServer path in the spec (and in
 *   drafts/proxy.draft.js) is 404 — MRLC reorganised, as lib/factors.js NOTES
 *   already warned. Live replacement is the MRLC GeoServer WMS GetFeatureInfo,
 *   layer nlcd_tcc_conus_2021_v2021-4, which returns the pixel value as JSON
 *   (PALETTE_INDEX = percent tree cover) — no GeoTIFF parsing, no new deps.
 *   Controls: Chattahoochee NF 96, Hartsfield runway 0, 7840 Roswell Rd 26.
 *
 * CACHING: api/index.js's dispatcher calls json(res, result.status, result.body)
 * and DROPS result.headers, and vercel.json forces Cache-Control: no-store on
 * /api/*. A response cache header would therefore never ship. Caching here is
 * in-process (module scope), which survives between invocations on a warm
 * container and evaporates on a cold start. That is the honest scope of it.
 */

'use strict';

// ─── Upstreams ───────────────────────────────────────────────────────────────

const FULTON_LAYER =
  'https://gismaps.fultoncountyga.gov/arcgispub/rest/services/PublicSafety/CE_Parcels/MapServer/0';
const TCC_WMS = 'https://www.mrlc.gov/geoserver/mrlc_display/wms';
const TCC_LAYER = 'nlcd_tcc_conus_2021_v2021-4';
const TCC_VINTAGE = 'NLCD Tree Canopy Cover (USFS/MRLC), CONUS 2021, v2021-4, 30 m';

// Fulton is slow and drops connections under rapid fire. Hardened the same way
// tools/probe-jurisdictions.mjs was on 2026-08-24.
const FULTON_TIMEOUT_MS = 60000;
const FULTON_RETRIES = 3;
const TCC_TIMEOUT_MS = 15000;

const SQFT_PER_ACRE = 43560;
const GA_ASSESSMENT_RATIO = 0.40; // O.C.G.A. § 48-5-7
const RATIO_TOLERANCE = 0.02;

// Multi-unit disambiguation: a supplied coordinate must be within this many
// metres of a candidate's centroid to be allowed to break a tie. Generous
// enough for a large parcel, tight enough that a wrong-city coordinate cannot
// silently select something.
const TIEBREAK_MAX_M = 400;

const OUT_FIELDS = [
  'ParcelID', 'Address', 'AddrNumber', 'AddrStreet', 'AddrSuffix', 'AddrUnit',
  'TaxYear', 'LandAcres', 'TotAppr', 'LandAppr', 'ImprAppr',
  'TotAssess', 'LandAssess', 'ImprAssess', 'LUCode', 'ClassCode', 'LivUnits', 'Owner',
].join(',');

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchJson(url, { timeoutMs = 15000, retries = 0, label = 'upstream' } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
      if (!res.ok) {
        last = { ok: false, status: res.status, error: `${label} HTTP ${res.status}` };
      } else {
        const data = await res.json();
        // ArcGIS reports failures with HTTP 200 + an {error:{...}} body.
        if (data && data.error) {
          last = { ok: false, status: 502, error: `${label}: ${data.error.message || 'ArcGIS error'}` };
        } else {
          return { ok: true, data };
        }
      }
    } catch (e) {
      last = { ok: false, status: 504, error: `${label}: ${e.name}: ${e.message}` };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  return last;
}

// ─── Address normalisation ───────────────────────────────────────────────────
//
// Fulton's `Address` field is a canonical uppercase string like
// "2021 PHILLIPS DR SE" or "7840 ROSWELL RD # 200". We normalise the caller's
// input to that shape and prefix-match it. Suffix expansion is the only
// rewriting done — we never rewrite the street name itself.

const SUFFIX = {
  ROAD: 'RD', DRIVE: 'DR', STREET: 'ST', LANE: 'LN', COURT: 'CT', CIRCLE: 'CIR',
  BOULEVARD: 'BLVD', PARKWAY: 'PKWY', TRAIL: 'TRL', PLACE: 'PL', TERRACE: 'TER',
  AVENUE: 'AVE', HIGHWAY: 'HWY', SQUARE: 'SQ', POINT: 'PT', CROSSING: 'XING',
  TRACE: 'TRC', COVE: 'CV', CREEK: 'CRK', RIDGE: 'RDG', VALLEY: 'VLY',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
};

function normalizeAddress(input) {
  const raw = String(input == null ? '' : input).trim();
  // Everything before the first comma is the street line; the city/state/zip
  // tail is discarded because Fulton's parcel layer HAS NO CITY FIELD
  // (TaxDist is a numeric code, not a place name — checked 2026-08-25).
  const head = raw.split(',')[0];
  const cleaned = head
    .toUpperCase()
    .replace(/[^\w\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(' ').map((t) => SUFFIX[t] || t);
  const normalized = tokens.join(' ');
  const m = /^(\d+[A-Z]?)\s+(.+)$/.exec(normalized);
  if (!m) return null;
  return { raw, normalized, number: m[1], street: m[2] };
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

// ─── Geometry helpers (lat/lon, because we ask ArcGIS for outSR=4326) ────────

function ringsCentroid(rings) {
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (area === 0) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function metresBetween(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const mLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(mLat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

// ─── Fulton query ────────────────────────────────────────────────────────────

async function queryFulton(where, { withGeometry = false } = {}) {
  const params = new URLSearchParams({
    where,
    outFields: OUT_FIELDS,
    returnGeometry: withGeometry ? 'true' : 'false',
    f: 'json',
  });
  if (withGeometry) params.set('outSR', '4326'); // server reprojects for us
  const r = await fetchJson(`${FULTON_LAYER}/query?${params.toString()}`, {
    timeoutMs: FULTON_TIMEOUT_MS,
    retries: FULTON_RETRIES,
    label: 'Fulton CE_Parcels',
  });
  if (!r.ok) return r;
  return { ok: true, features: (r.data && r.data.features) || [] };
}

// ─── Canopy (NLCD TCC via MRLC GeoServer WMS GetFeatureInfo) ─────────────────

function to3857(lon, lat) {
  const x = (lon * 20037508.34) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.34 / 180;
  return [x, y];
}

async function tccAt(lon, lat) {
  const [x, y] = to3857(lon, lat);
  const half = 45; // metres → a 3×3 grid of ~30 m cells; we read the centre cell
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
    layers: TCC_LAYER, query_layers: TCC_LAYER,
    crs: 'EPSG:3857', // projected CRS → x,y axis order, avoids the 1.3.0 lat/lon swap trap
    bbox: `${x - half},${y - half},${x + half},${y + half}`,
    width: '3', height: '3', i: '1', j: '1',
    info_format: 'application/json',
  });
  const r = await fetchJson(`${TCC_WMS}?${params.toString()}`, {
    timeoutMs: TCC_TIMEOUT_MS, retries: 1, label: 'MRLC TCC',
  });
  if (!r.ok) return null;
  const f = r.data && r.data.features && r.data.features[0];
  const v = f && f.properties && f.properties.PALETTE_INDEX;
  const n = Number(v);
  // TCC uses values >100 for nodata/fill. Never let one become a canopy percent.
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Sample canopy over the parcel. One pixel at the centroid for a small lot;
 * for a parcel that genuinely spans multiple 30 m pixels, add up to 4 interior
 * points and average. Reports how many pixels backed the number, because at
 * 30 m a typical 0.25–1 acre Atlanta lot is only 1–4 pixels and the surface
 * must say so rather than imply precision it does not have.
 */
async function canopyForParcel(rings) {
  const [clon, clat] = ringsCentroid(rings);
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);

  const points = [[clon, clat]];
  const widthM = metresBetween(minLon, clat, maxLon, clat);
  const heightM = metresBetween(clon, minLat, clon, maxLat);
  if (widthM > 60 && heightM > 60) {
    for (const fx of [0.25, 0.75]) {
      for (const fy of [0.25, 0.75]) {
        const lon = minLon + (maxLon - minLon) * fx;
        const lat = minLat + (maxLat - minLat) * fy;
        if (pointInRing(lon, lat, ring)) points.push([lon, lat]);
      }
    }
  }

  const vals = (await Promise.all(points.map(([lo, la]) => tccAt(lo, la))))
    .filter((v) => v != null);
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    value: Math.round(mean),
    pixels: vals.length,
    centroid: { lat: Number(clat.toFixed(6)), lon: Number(clon.toFixed(6)) },
  };
}

// ─── In-process cache ────────────────────────────────────────────────────────
// Fulton's data changes annually, not hourly. Module scope persists on a warm
// serverless container and is lost on a cold start — a best-effort speedup, not
// a durability guarantee.

const CACHE = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return hit.body;
}
function cacheSet(key, body) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { at: Date.now(), body });
}

// ─── Field assembly ──────────────────────────────────────────────────────────

function provenanced(value, source, extra) {
  return Object.assign({ value, source }, extra || {});
}

function buildFields(attrs, canopy) {
  const fields = {};
  const unavailable = [];
  const taxYear = attrs.TaxYear != null ? `TaxYear ${attrs.TaxYear}` : 'TaxYear not stated';

  // Lot size — LandAcres is a double, populated county-wide.
  const acres = Number(attrs.LandAcres);
  if (Number.isFinite(acres) && acres > 0) {
    fields.lotSizeSqFt = provenanced(
      Math.round(acres * SQFT_PER_ACRE),
      'Fulton CE_Parcels.LandAcres × 43,560',
      { asOf: taxYear, acres }
    );
  } else {
    unavailable.push('lotSizeSqFt');
  }

  // ⭐ APPRAISED, never assessed. See the 40% trap note at the top of this file.
  const appr = Number(attrs.TotAppr);
  if (Number.isFinite(appr) && appr > 0) {
    fields.assessedValue = provenanced(
      appr,
      'Fulton CE_Parcels.TotAppr (appraised / fair market value — NOT TotAssess)',
      { asOf: taxYear }
    );
  } else {
    unavailable.push('assessedValue');
  }

  if (canopy) {
    fields.canopyPct = provenanced(canopy.value, TCC_VINTAGE, {
      pixels: canopy.pixels,
      resolutionNote: `30 m raster; this parcel was sampled at ${canopy.pixels} pixel${canopy.pixels === 1 ? '' : 's'}`
        + (canopy.pixels === 1 ? ' — a single 30 m cell can span more than this lot, so treat it as indicative' : ''),
      sampledAt: canopy.centroid,
      canopySource: 'measured',
    });
  } else {
    unavailable.push('canopyPct');
  }

  // propertyType: asserted ONLY from LivUnits, which is unambiguous (count of
  // living units). LUCode/ClassCode are echoed raw rather than mapped, because
  // no published code table was verified for them and inventing one is exactly
  // what the provenance ledger exists to prevent.
  const units = Number(attrs.LivUnits);
  if (Number.isFinite(units) && units === 1) {
    fields.propertyType = provenanced('singleFamily', 'Fulton CE_Parcels.LivUnits = 1', { asOf: taxYear });
  } else if (Number.isFinite(units) && units > 1) {
    fields.propertyType = provenanced('multiFamily', `Fulton CE_Parcels.LivUnits = ${units}`, { asOf: taxYear });
  } else {
    unavailable.push('propertyType');
  }

  // Never published by Fulton. Always declared, never defaulted.
  unavailable.push('buildingSqFt', 'yearBuilt');

  return { fields, unavailable };
}

function assessmentCheck(attrs) {
  const appr = Number(attrs.TotAppr);
  const assess = Number(attrs.TotAssess);
  if (!Number.isFinite(appr) || appr <= 0 || !Number.isFinite(assess)) {
    return { assessmentRatio: null, expected: GA_ASSESSMENT_RATIO, ok: null,
      note: 'Ratio not checkable — TotAppr or TotAssess missing on this parcel' };
  }
  const ratio = assess / appr;
  return {
    assessmentRatio: Number(ratio.toFixed(4)),
    expected: GA_ASSESSMENT_RATIO,
    ok: Math.abs(ratio - GA_ASSESSMENT_RATIO) <= RATIO_TOLERANCE,
    totAppr: appr,
    totAssess: assess,
    note: 'O.C.G.A. § 48-5-7 — Georgia assesses at 40% of fair market value. '
        + 'assessedValue above is the APPRAISED figure (TotAppr).',
  };
}

function candidateSummary(a) {
  return {
    parcelId: a.ParcelID,
    address: a.Address,
    unit: a.AddrUnit || null,
    totAppr: a.TotAppr,
    landAcres: a.LandAcres,
    classCode: a.ClassCode,
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

async function lookupParcel({ address, lat, lon }) {
  const parsed = normalizeAddress(address);
  if (!parsed) {
    return { status: 400, body: {
      found: false,
      reason: 'unparseable-address',
      message: 'Provide ?address= as a street address beginning with a house number, e.g. "2021 Phillips Dr SE, Atlanta, GA".',
      received: address == null ? null : String(address),
    } };
  }

  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
  const cacheKey = `${parsed.normalized}|${hasCoords ? `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}` : ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { status: cached.found ? 200 : 404, body: { ...cached, cached: true } };

  // Primary key: house number (exact) + the canonical Address string (prefix).
  const where = `AddrNumber='${esc(parsed.number)}' AND UPPER(Address) LIKE '${esc(parsed.normalized)}%'`;
  const q = await queryFulton(where, { withGeometry: true });

  if (!q.ok) {
    // Fail loud, and never as a 200 with empty data — a silent empty result is
    // indistinguishable from "no such parcel", which is the mistake to avoid.
    return { status: 502, body: {
      found: false,
      reason: 'upstream-unavailable',
      message: 'Fulton County parcel service did not respond. The lookup is unavailable; the calculator is unaffected.',
      upstreamError: q.error,
      query: { normalizedAddress: parsed.normalized },
    } };
  }

  const feats = q.features;
  if (feats.length === 0) {
    const body = {
      found: false,
      reason: 'no-fulton-parcel',
      message: `No Fulton County parcel matches "${parsed.normalized}". Coverage is Fulton County only — addresses outside Fulton are not in this dataset.`,
      query: { normalizedAddress: parsed.normalized, houseNumber: parsed.number },
      coverage: { county: 'Fulton', parcels: 373307, source: 'Fulton CE_Parcels/0' },
    };
    cacheSet(cacheKey, body);
    return { status: 404, body };
  }

  // Disambiguate. One hit is the answer. Several hits (condos, unit-numbered
  // commercial) need the caller's coordinate — and if there is none, we return
  // the candidates rather than picking one.
  let chosen = null;
  let matchMethod = 'address-exact';
  if (feats.length === 1) {
    chosen = feats[0];
  } else if (hasCoords) {
    const plat = Number(lat), plon = Number(lon);
    let best = null;
    for (const f of feats) {
      if (!f.geometry || !f.geometry.rings) continue;
      const [clon, clat] = ringsCentroid(f.geometry.rings);
      const d = metresBetween(plon, plat, clon, clat);
      if (!best || d < best.d) best = { f, d };
    }
    if (best && best.d <= TIEBREAK_MAX_M) {
      chosen = best.f;
      matchMethod = `address+coordinate-tiebreak (${Math.round(best.d)} m from supplied point)`;
    }
  }

  if (!chosen) {
    const body = {
      found: false,
      reason: 'ambiguous-address',
      message: `${feats.length} Fulton parcels share the address "${parsed.normalized}" (multi-unit building). `
             + 'Supply &lat=&lon= to disambiguate, or pick a parcelId from candidates.',
      query: { normalizedAddress: parsed.normalized },
      candidates: feats.map((f) => candidateSummary(f.attributes)),
    };
    cacheSet(cacheKey, body);
    return { status: 409, body };
  }

  const attrs = chosen.attributes;
  const canopy = chosen.geometry && chosen.geometry.rings
    ? await canopyForParcel(chosen.geometry.rings)
    : null;

  const { fields, unavailable } = buildFields(attrs, canopy);

  const body = {
    found: true,
    parcelId: attrs.ParcelID,
    address: attrs.Address,
    county: 'Fulton',
    matchMethod,
    fields,
    unavailable,
    unavailableReason: "Not published by Fulton County's public parcel service. "
      + 'Fulton has no buildingSqFt or yearBuilt field; enter them if known. '
      + 'No default is substituted.',
    checks: assessmentCheck(attrs),
    raw: {
      LUCode: attrs.LUCode, ClassCode: attrs.ClassCode, LivUnits: attrs.LivUnits,
      TaxYear: attrs.TaxYear, LandAcres: attrs.LandAcres,
      TotAppr: attrs.TotAppr, LandAppr: attrs.LandAppr, ImprAppr: attrs.ImprAppr,
      TotAssess: attrs.TotAssess,
    },
    sources: {
      parcel: 'Fulton County GIS — PublicSafety/CE_Parcels/MapServer/0 (pubgis.DBO.Tax_Parcels)',
      canopy: TCC_VINTAGE,
    },
    route: '/api/parcel',
  };

  cacheSet(cacheKey, body);
  return { status: 200, body };
}

async function handleParcel(_body, params) {
  const address = params && params.get('address');
  if (!address) {
    return { status: 400, body: {
      found: false,
      reason: 'missing-address',
      message: 'Provide ?address=. Optional &lat=&lon= disambiguate a multi-unit address.',
      example: '/api/parcel?address=2021%20Phillips%20Dr%20SE,%20Atlanta,%20GA',
    } };
  }
  return lookupParcel({
    address,
    lat: params.get('lat'),
    lon: params.get('lon') || params.get('lng'),
  });
}

const PARCEL_ROUTES = { '/api/parcel': { handler: handleParcel, method: 'GET' } };

module.exports = {
  PARCEL_ROUTES,
  handleParcel,
  lookupParcel,
  normalizeAddress,
  ringsCentroid,
  canopyForParcel,
  tccAt,
  queryFulton,
  assessmentCheck,
  FULTON_LAYER,
  TCC_WMS,
  TCC_LAYER,
};
