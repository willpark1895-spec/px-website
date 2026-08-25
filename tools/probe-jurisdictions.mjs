#!/usr/bin/env node
/**
 * probe-jurisdictions.mjs — M0 acceptance artifact.
 *
 * Probes each Atlanta-metro jurisdiction's public parcel GIS endpoint and prints
 * a live parcel count. Exists so the site's coverage claim is MEASURED, not
 * remembered. Run it before making any public statement about coverage.
 *
 *   node tools/probe-jurisdictions.mjs
 *   node tools/probe-jurisdictions.mjs --json
 *
 * NOTE ON DOUBLE COUNTING — read before summing anything.
 * Alpharetta, Atlanta, Johns Creek, Milton, Roswell and Sandy Springs are all
 * INSIDE Fulton County. Brookhaven and Chamblee are INSIDE DeKalb County.
 * Adding city counts to county counts counts the same parcels twice. The
 * defensible universe is the COUNTY rows alone. This script therefore reports
 * city and county subtotals separately and refuses to print a single total.
 */

const ENDPOINTS = [
  { name: 'Alpharetta',    tier: 'city',   within: 'Fulton',
    url: 'https://alphagis.alpharetta.ga.us/arcgis/rest/services/TaxParcels/MapServer', layer: 0 },
  { name: 'Roswell',       tier: 'city',   within: 'Fulton',
    url: 'https://gisweb.ci.roswell.ga.us/arcgis/rest/services/LGIM_ParcelPublishing/TaxParcels/MapServer', layer: 0 },
  { name: 'Sandy Springs', tier: 'city',   within: 'Fulton',
    url: 'https://gis2.sandyspringsga.gov/arcgis/rest/services/CommDev/ParcelsPlats/MapServer', layer: 2 },
  { name: 'Fulton County', tier: 'county', within: null,
    url: 'https://gismaps.fultoncountyga.gov/arcgispub/rest/services/PublicSafety/CE_Parcels/MapServer', layer: 0 },
  { name: 'DeKalb County', tier: 'county', within: null,
    url: 'https://dcgis.dekalbcountyga.gov/hosted/rest/services/PropertyAppraisal/Parcels_IASWorld/MapServer', layer: 0 },
  // Unresolved as of 2026-08-25 - host reachable, no public parcel service located.
  { name: 'Milton',        tier: 'city',   within: 'Fulton', url: null, note: 'parcel service requires a token' },
  { name: 'Johns Creek',   tier: 'city',   within: 'Fulton', url: null, note: 'REST root did not return JSON' },
  { name: 'Brookhaven',    tier: 'city',   within: 'DeKalb', url: null, note: 'no parcel-like service published' },
  { name: 'Atlanta',       tier: 'city',   within: 'Fulton', url: null, note: 'CadastralLots is annotation, not parcel polygons' },
  { name: 'Chamblee',      tier: 'city',   within: 'DeKalb', url: null, note: 'TaxParcelZoning returns no queryable layers' },
];

// Fulton County's service is large and routinely takes 30-45s cold. A single
// short attempt reports it as dead and understates coverage by 373,307 parcels,
// which is worse than slow. Retry before believing a timeout.
const TIMEOUT_MS = 60000;
const RETRIES = 3;

async function attempt(q) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(q, { signal: ctl.signal, headers: { 'User-Agent': 'terravalue-probe/1.0' } });
    const j = await r.json();
    if (typeof j.count === 'number') return { ok: true, count: j.count };
    return { ok: false, detail: (j.error && j.error.message) || 'no count field', retry: false };
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    return { ok: false, detail: timedOut ? 'timeout' : e.message, retry: timedOut };
  } finally { clearTimeout(t); }
}

async function probe(ep) {
  if (!ep.url) return { ...ep, status: 'unmapped', count: null };
  const q = `${ep.url}/${ep.layer}/query?where=1%3D1&returnCountOnly=true&f=json`;
  let last;
  for (let i = 1; i <= RETRIES; i++) {
    last = await attempt(q);
    if (last.ok) return { ...ep, status: 'ok', count: last.count, attempts: i };
    if (!last.retry) break;
  }
  return { ...ep, status: 'error', count: null, detail: `${last.detail} after ${RETRIES} attempts`, attempts: RETRIES };
}

// Sequential for the mapped endpoints: several of these are small municipal
// servers and hammering them in parallel is both rude and a source of timeouts.
const results = [];
for (const ep of ENDPOINTS) results.push(await probe(ep));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nParcel endpoint probe — ${new Date().toISOString()}\n`);
  console.log(`${pad('JURISDICTION', 16)}${pad('TIER', 8)}${pad('STATUS', 10)}${'COUNT'.padStart(10)}  DETAIL`);
  console.log('-'.repeat(72));
  for (const r of results) {
    console.log(
      pad(r.name, 16) + pad(r.tier, 8) + pad(r.status, 10) +
      String(r.count ?? '—').padStart(10) + '  ' + (r.detail || r.note || '')
    );
  }
  console.log('-'.repeat(72));
  const county = results.filter(r => r.tier === 'county' && r.count != null);
  const city   = results.filter(r => r.tier === 'city'   && r.count != null);
  const sum = a => a.reduce((s, r) => s + r.count, 0);
  console.log(`County-level universe (non-overlapping): ${sum(county).toLocaleString()} across ${county.length}/2 counties`);
  console.log(`City-level verified (SUBSET of the above, do not add): ${sum(city).toLocaleString()} across ${city.length} cities`);
  console.log(`Unmapped or failing: ${results.filter(r => r.count == null).length}/${results.length}\n`);
}

process.exit(results.some(r => r.status === 'error') ? 1 : 0);
