/**
 * TerraValue — acceptance tests for GET /api/parcel  (M4, Fulton live lookup)
 * =============================================================================
 * Pre-registered in the 2026-08-26 session prompt §6. Per the 2026-08-23 rule —
 * "an acceptance criterion is not written until it has been run against a
 * known-good AND a known-bad case" — every criterion below asserts BOTH:
 *
 *   GOOD: the thing that must pass
 *   BAD : a case that must FAIL the criterion, proving the check has teeth
 *
 * A criterion whose known-bad case also passes is not a test, it is decoration.
 *
 * Criterion 5 (page degrades when /api/parcel is dead) is a browser check and
 * lives with the page, not here. Criterion 6 is exercised as: the in-process
 * module call and a real HTTP call through api/index.js's dispatcher must
 * produce identical numbers for the same address.
 *
 * Run:  node tests/parcel-acceptance.js
 * Live: hits Fulton County GIS and MRLC. Slow (~20–40 s) and network-dependent
 *       by design — the point is to test the wire, not a fixture of it.
 */

'use strict';

const http = require('http');
const assert = require('assert');
const {
  lookupParcel, normalizeAddress, assessmentCheck, queryFulton,
} = require('../lib/parcel');
const apiHandler = require('../api/index.js');

// A real Fulton single-family parcel, confirmed live 2026-08-25.
const GOOD_ADDRESS = '2021 Phillips Dr SE, Atlanta, GA';
// Known-bad: a real address that is emphatically not in Fulton County.
const OUTSIDE_FULTON = '1600 Pennsylvania Ave NW, Washington, DC';
// Known-bad: well-formed but nonexistent street.
const NONEXISTENT = '999999 Nonexistent Blvd, Atlanta, GA';
// Multi-unit: 15 parcels share this address.
const MULTI_UNIT = '7840 Roswell Rd, Sandy Springs, GA 30350';

let pass = 0, fail = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    // Guard against the decoration failure mode: check() is synchronous, so a
    // body returning a Promise would have its assertions run AFTER the verdict
    // was already recorded — a test that passes without testing anything.
    // Two such checks existed in the first draft of this file. Await upstream
    // and assert on the resolved value instead.
    if (r && typeof r.then === 'function') {
      throw new Error('check() body returned a Promise — assertions would not be awaited. '
        + 'Await the async work before check() and assert on the result.');
    }
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ❌ ${name}\n       ${e.message}`);
  }
}

// ─── local HTTP harness (exercises the real dispatcher + route table) ────────

function listen() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => apiHandler(req, res));
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { reject(new Error(`bad JSON from ${path}: ${d.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nTerraValue — /api/parcel acceptance (live upstreams)\n');

  // ── CRITERION 0 (structural): address normalisation ────────────────────────
  console.log('Criterion 0 — address normalisation');
  check('GOOD: "Road" normalises to RD and splits number/street', () => {
    const n = normalizeAddress('9125 Clark Road, Union City, GA');
    assert.strictEqual(n.normalized, '9125 CLARK RD');
    assert.strictEqual(n.number, '9125');
  });
  check('BAD: input with no house number is rejected, not guessed', () => {
    assert.strictEqual(normalizeAddress('Clark Road, Union City, GA'), null);
    assert.strictEqual(normalizeAddress(''), null);
    assert.strictEqual(normalizeAddress(null), null);
  });

  // ── CRITERION 1: real Fulton address resolves; outside Fulton says so ──────
  console.log('\nCriterion 1 — a real Fulton address returns found:true with lot size and value');
  const good = await lookupParcel({ address: GOOD_ADDRESS });
  check('GOOD: found:true with non-null lotSizeSqFt and assessedValue', () => {
    assert.strictEqual(good.status, 200, `status ${good.status}`);
    assert.strictEqual(good.body.found, true);
    assert.ok(good.body.fields.lotSizeSqFt && good.body.fields.lotSizeSqFt.value > 0,
      'lotSizeSqFt missing or non-positive');
    assert.ok(good.body.fields.assessedValue && good.body.fields.assessedValue.value > 0,
      'assessedValue missing or non-positive');
    assert.ok(good.body.parcelId, 'parcelId missing');
  });

  const outside = await lookupParcel({ address: OUTSIDE_FULTON });
  check('BAD: address outside Fulton returns found:false WITH a reason, not silence', () => {
    assert.strictEqual(outside.body.found, false);
    assert.ok(outside.body.reason, 'no machine-readable reason');
    assert.ok(outside.body.message && outside.body.message.length > 10, 'no human-readable message');
    assert.notStrictEqual(outside.status, 200, 'a miss must not be dressed as 200 OK');
  });

  const nonexistent = await lookupParcel({ address: NONEXISTENT });
  check('BAD: nonexistent street returns found:false with a reason', () => {
    assert.strictEqual(nonexistent.body.found, false);
    assert.strictEqual(nonexistent.body.reason, 'no-fulton-parcel');
  });

  check('BAD: a miss carries NO fields object to prefill from', () => {
    assert.ok(!outside.body.fields, 'a not-found response must not ship prefillable fields');
    assert.ok(!nonexistent.body.fields, 'a not-found response must not ship prefillable fields');
  });

  // ── CRITERION 2 ⭐ the 40% trap ────────────────────────────────────────────
  console.log('\nCriterion 2 ⭐ — the 40% trap: API returns APPRAISED, never ASSESSED');
  check('GOOD: observed TotAssess/TotAppr is 0.40 ± 0.02 on the served parcel', () => {
    const c = good.body.checks;
    assert.ok(c, 'no checks block');
    assert.ok(c.assessmentRatio != null, 'ratio not computed');
    assert.ok(Math.abs(c.assessmentRatio - 0.40) <= 0.02,
      `ratio ${c.assessmentRatio} outside 0.40 ± 0.02`);
    assert.strictEqual(c.ok, true);
  });
  check('BAD: returned assessedValue is NOT equal to TotAssess', () => {
    const v = good.body.fields.assessedValue.value;
    assert.notStrictEqual(v, good.body.raw.TotAssess,
      'returned value equals TotAssess — the 60%-low failure');
    assert.strictEqual(v, good.body.raw.TotAppr, 'returned value is not TotAppr');
  });
  check('BAD: the ratio check has teeth — a fabricated 1:1 parcel fails it', () => {
    const bogus = assessmentCheck({ TotAppr: 500000, TotAssess: 500000 });
    assert.strictEqual(bogus.ok, false, 'a 1.0 ratio must fail the 40% check');
    const alsoBogus = assessmentCheck({ TotAppr: 500000, TotAssess: 200000 });
    assert.strictEqual(alsoBogus.ok, true, 'a true 0.40 ratio must pass');
  });
  check('BAD: assessedValue source string names the appraised field explicitly', () => {
    const s = good.body.fields.assessedValue.source;
    assert.ok(/TotAppr/.test(s), 'source does not name TotAppr');
    assert.ok(/appraised|fair market/i.test(s), 'source does not say appraised/FMV');
  });

  // Independent corroboration straight from the county, not from our own response.
  const direct = await queryFulton(
    `AddrNumber='2021' AND UPPER(Address) LIKE '2021 PHILLIPS DR SE%'`);
  check('GOOD: value matches an independent county query (not our own cache)', () => {
    assert.ok(direct.ok && direct.features.length >= 1, 'county query returned nothing');
    const a = direct.features[0].attributes;
    assert.strictEqual(good.body.fields.assessedValue.value, a.TotAppr);
    assert.ok(Math.abs(a.TotAssess / a.TotAppr - 0.40) <= 0.02);
  });

  // ── CRITERION 3: every field carries a source ─────────────────────────────
  console.log('\nCriterion 3 — every returned field carries a non-empty source');
  check('GOOD: all fields have a non-empty source string', () => {
    const entries = Object.entries(good.body.fields);
    assert.ok(entries.length > 0, 'no fields returned');
    for (const [k, v] of entries) {
      assert.ok(v && typeof v === 'object', `${k} is not a provenanced object`);
      assert.ok('value' in v, `${k} has no value`);
      assert.ok(typeof v.source === 'string' && v.source.trim().length > 0,
        `${k} has a value but no source`);
    }
  });
  check('BAD: a value with an empty source is detectable by this same check', () => {
    const sabotaged = { ...good.body.fields, sabotage: { value: 42, source: '' } };
    let caught = false;
    for (const [, v] of Object.entries(sabotaged)) {
      if (!(typeof v.source === 'string' && v.source.trim().length > 0)) caught = true;
    }
    assert.strictEqual(caught, true, 'the source check failed to catch an empty source');
  });
  check('GOOD: canopy states its 30 m resolution on the surface', () => {
    const c = good.body.fields.canopyPct;
    if (!c) {
      assert.ok(good.body.unavailable.includes('canopyPct'),
        'canopy absent from fields but not declared unavailable');
      return;
    }
    assert.ok(/30\s*m/.test(c.resolutionNote || ''), 'no 30 m resolution note');
    assert.ok(c.value >= 0 && c.value <= 100, `canopy ${c.value} out of range`);
    assert.ok(Number.isInteger(c.pixels) && c.pixels >= 1,
      'canopy does not report how many pixels backed the number');
    assert.ok(c.sampledAt && typeof c.sampledAt.lat === 'number',
      'canopy does not report where it was sampled');
  });

  // ── CRITERION 4: unavailable fields are declared, never defaulted ─────────
  console.log('\nCriterion 4 — buildingSqFt and yearBuilt are declared unavailable, never valued');
  check('GOOD: both appear in unavailable[]', () => {
    assert.ok(Array.isArray(good.body.unavailable));
    assert.ok(good.body.unavailable.includes('buildingSqFt'), 'buildingSqFt not declared');
    assert.ok(good.body.unavailable.includes('yearBuilt'), 'yearBuilt not declared');
  });
  check('BAD: neither ever appears in fields with a value', () => {
    assert.ok(!('buildingSqFt' in good.body.fields), 'buildingSqFt was given a value');
    assert.ok(!('yearBuilt' in good.body.fields), 'yearBuilt was given a value');
  });
  check('GOOD: unavailableReason explains, and promises no substitution', () => {
    assert.ok(/not published/i.test(good.body.unavailableReason));
    assert.ok(/no default/i.test(good.body.unavailableReason));
  });
  check('BAD: no field in the response is a known engine demo default', () => {
    // The engine's server-side defaults, which must never masquerade as county data.
    const DEMO = [15000, 25, 0.035, 3];
    for (const [k, v] of Object.entries(good.body.fields)) {
      if (typeof v.value !== 'number') continue;
      if (DEMO.includes(v.value)) {
        assert.fail(`${k}=${v.value} collides with an engine default — verify it is real, not substituted`);
      }
    }
  });

  // ── Ambiguity: multi-unit must refuse rather than guess ───────────────────
  console.log('\nCriterion 4b — a multi-unit address refuses rather than picking one');
  const multi = await lookupParcel({ address: MULTI_UNIT });
  check('BAD: 15 parcels share the address → found:false + candidates, not a guess', () => {
    assert.strictEqual(multi.body.found, false);
    assert.strictEqual(multi.body.reason, 'ambiguous-address');
    assert.ok(Array.isArray(multi.body.candidates) && multi.body.candidates.length > 1,
      'no candidate list offered');
    assert.ok(!multi.body.fields, 'ambiguous response must not ship prefillable fields');
  });

  // ── CRITERION 6: CLI path and HTTP path agree ────────────────────────────
  console.log('\nCriterion 6 — a CLI call and an HTTP call produce the same numbers');
  const server = await listen();
  const { port } = server.address();
  try {
    const viaHttp = await getJson(port, `/api/parcel?address=${encodeURIComponent(GOOD_ADDRESS)}`);
    check('GOOD: HTTP route is wired and returns the same parcel', () => {
      assert.strictEqual(viaHttp.status, 200, `status ${viaHttp.status}`);
      assert.strictEqual(viaHttp.body.parcelId, good.body.parcelId);
    });
    check('GOOD: every numeric field is identical across the two paths', () => {
      for (const [k, v] of Object.entries(good.body.fields)) {
        assert.deepStrictEqual(viaHttp.body.fields[k].value, v.value, `${k} differs`);
      }
      assert.strictEqual(viaHttp.body.checks.assessmentRatio, good.body.checks.assessmentRatio);
    });
    const health = await getJson(port, '/api/health');
    check('GOOD: /api/health lists /api/parcel', () => {
      assert.ok(health.body.routes.includes('/api/parcel'), 'route not advertised');
    });
    const noAddr = await getJson(port, '/api/parcel');
    check('BAD: /api/parcel with no address is a 400 + reason + guidance, not a 500', () => {
      assert.strictEqual(noAddr.status, 400);
      assert.strictEqual(noAddr.body.found, false);
      assert.strictEqual(noAddr.body.reason, 'missing-address');
      assert.ok(noAddr.body.message && noAddr.body.example, 'no guidance offered');
    });
    const post = await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/parcel', method: 'POST' },
        (res) => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    check('GOOD: existing routes still behave — POST to a GET route is not a 500', () => {
      assert.ok(post === 200 || post === 400 || post === 404 || post === 405,
        `unexpected status ${post}`);
    });
  } finally {
    server.close();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (good.body.found) {
    const f = good.body.fields;
    console.log(`\n  Served parcel: ${good.body.parcelId}  ${good.body.address}`);
    console.log(`    lotSizeSqFt   ${f.lotSizeSqFt ? f.lotSizeSqFt.value : '—'}`);
    console.log(`    assessedValue ${f.assessedValue ? f.assessedValue.value : '—'}  (TotAppr; TotAssess was ${good.body.raw.TotAssess})`);
    console.log(`    canopyPct     ${f.canopyPct ? `${f.canopyPct.value}  [${f.canopyPct.pixels || '?'} px]` : '—'}`);
    console.log(`    propertyType  ${f.propertyType ? f.propertyType.value : '—'}`);
    console.log(`    ratio         ${good.body.checks.assessmentRatio}`);
    console.log(`    unavailable   ${good.body.unavailable.join(', ')}`);
  }
  console.log(`${'─'.repeat(64)}\n`);
  if (fail > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
