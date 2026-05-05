#!/usr/bin/env node
/**
 * E2E Validation Script
 *
 * Run against a deployed TerraValue API to verify all endpoints work.
 * Usage: node tests/e2e-validate.js https://your-project.vercel.app
 *
 * Validates:
 *  1. GET  /api/health         — returns status: 'ok'
 *  2. POST /api/ecosystem      — returns totalAnnual > 0
 *  3. POST /api/appreciation   — returns totalImpact
 *  4. POST /api/certifications — returns certifications object
 *  5. POST /api/valuation      — returns estimatedValue
 *  6. POST /api/land-valuation — returns reconciledValue
 *  7. POST /api/analyze        — full orchestrator
 *  8. POST /api/ecosystem (bad input) — returns 400
 *  9. GET  /api/nonexistent    — returns 404
 */

const BASE = process.argv[2];
if (!BASE) {
  console.error('Usage: node tests/e2e-validate.js <base-url>');
  console.error('  e.g. node tests/e2e-validate.js https://px-terravalue.vercel.app');
  process.exit(1);
}

const API_KEY = process.env.TERRAVALUE_API_KEY || '';

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path) {
  const headers = {};
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log(`\nTerraValue E2E Validation — ${BASE}\n${'─'.repeat(50)}`);

  // 1. Health
  const health = await get('/api/health');
  check('GET /api/health returns 200', health.status === 200);
  check('Health status is ok', health.body.status === 'ok');
  check('Health lists routes', Array.isArray(health.body.routes) && health.body.routes.length >= 7);

  // 2. Ecosystem
  const eco = await post('/api/ecosystem', {
    lotSizeSqFt: 43560, canopyPct: 35, assessedValue: 200000, state: 'GA',
  });
  check('POST /api/ecosystem returns 200', eco.status === 200);
  check('Ecosystem totalAnnual > 0', eco.body.totalAnnual > 0, `got ${eco.body.totalAnnual}`);
  check('Ecosystem has dataQuality', eco.body.dataQuality != null);
  check('Ecosystem has services breakdown', eco.body.services != null);

  // 3. Appreciation
  const app = await post('/api/appreciation', {
    currentScore: 45, projectedScore: 72, timelineYears: 30, propertyValue: 500000,
  });
  check('POST /api/appreciation returns 200', app.status === 200);
  check('Appreciation has totalImpact', app.body.totalImpact != null);
  check('Appreciation has propertyImpact', app.body.propertyImpact != null);

  // 4. Certifications
  const cert = await post('/api/certifications', {
    canopyPct: 40, hasGreenInfrastructure: true, biodiversityNetGainPct: 12,
  });
  check('POST /api/certifications returns 200', cert.status === 200);
  check('Certifications has leed', cert.body.certifications?.leed != null);
  check('Certifications has breeam', cert.body.certifications?.breeam != null);

  // 5. Valuation
  const val = await post('/api/valuation', {
    assessedValue: 200000, state: 'GA',
  });
  check('POST /api/valuation returns 200', val.status === 200);
  check('Valuation has estimatedValue or sources', val.body.estimatedValue != null || val.body.sourceCount != null);

  // 6. Land Valuation
  const lv = await post('/api/land-valuation', {
    lotSizeSqFt: 15000, assessedValue: 120000, state: 'GA', canopyPct: 30,
    buildingSqFt: 2200, yearBuilt: 2005,
  });
  check('POST /api/land-valuation returns 200', lv.status === 200);
  check('LandValuation has reconciledValue', lv.body.valuation?.reconciledValue > 0,
    `got ${lv.body.valuation?.reconciledValue}`);
  check('LandValuation has dataQuality', lv.body.dataQuality != null);

  // 7. Full Analyze
  const analyze = await post('/api/analyze', {
    lotSizeSqFt: 43560, canopyPct: 35, assessedValue: 200000, state: 'GA',
  });
  check('POST /api/analyze returns 200', analyze.status === 200);
  check('Analyze has ecosystemServices', analyze.body.ecosystemServices != null);

  // 8. Validation error
  const bad = await post('/api/ecosystem', { canopyPct: 35 });
  check('Missing fields returns 400', bad.status === 400);
  check('Error message mentions missing fields', bad.body.message?.includes('Missing'));

  // 9. 404
  const notFound = await get('/api/nonexistent');
  check('Unknown route returns 404', notFound.status === 404);

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);

  if (failed > 0) {
    console.error('\nSome checks failed. Review output above.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed! API is ready for production.');
  }
}

run().catch(err => {
  console.error('E2E validation error:', err);
  process.exit(1);
});
