/**
 * Golden Parity Tests
 *
 * Validates that lib/terravalue-engine.js (server-side, config-imported)
 * produces IDENTICAL output to website/terravalue-engine.js (original monolith).
 *
 * Run: node --test tests/golden-parity.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Lib = require('../lib/terravalue-engine');
const Orig = require('../website/terravalue-engine');

// ─── Test Fixtures ───────────────────────────────────────────

const PARCELS = {
  roswell: { lotSizeSqFt: 43560, canopyPct: 35, assessedValue: 200000, state: 'GA' },
  mountVernon: { lotSizeSqFt: 21780, canopyPct: 45, assessedValue: 150000, state: 'GA' },
  northRiver: { lotSizeSqFt: 87120, canopyPct: 20, assessedValue: 500000, state: 'GA' },
  noCanopy: { lotSizeSqFt: 10000, canopyPct: 0, assessedValue: 80000, state: 'GA' },
  maxCanopy: { lotSizeSqFt: 43560, canopyPct: 80, assessedValue: 300000, state: 'GA' },
  nonGA: { lotSizeSqFt: 30000, canopyPct: 30, assessedValue: 400000, state: 'CA' },
};

const PROJECTIONS = [
  { currentScore: 45, projectedScore: 72, timelineYears: 30, propertyValue: 500000, currentCanopyPct: 25, lotSizeSqFt: 15000 },
  { currentScore: 20, projectedScore: 80, timelineYears: 10, propertyValue: 300000, currentCanopyPct: 10, lotSizeSqFt: 43560 },
  { currentScore: 70, projectedScore: 70, timelineYears: 5, propertyValue: 750000, currentCanopyPct: 40, lotSizeSqFt: 8000 },
  { currentScore: 90, projectedScore: 95, timelineYears: 20, propertyValue: 1000000, currentCanopyPct: 60, lotSizeSqFt: 100000 },
];

const SITE_DATA = {
  high: { canopyPct: 55, hasGreenInfrastructure: true, biodiversityNetGainPct: 15, plantWallPct: 3, pottedPlantPct: 2, hasErosionPlan: true, hasBiophiliaPlan: true },
  low: { canopyPct: 10, hasGreenInfrastructure: false, biodiversityNetGainPct: 3, plantWallPct: 0, pottedPlantPct: 0, hasErosionPlan: false, hasBiophiliaPlan: false },
  mid: { canopyPct: 30, hasGreenInfrastructure: true, biodiversityNetGainPct: 8, plantWallPct: 1, pottedPlantPct: 0.5, hasErosionPlan: true, hasBiophiliaPlan: false },
};

const FULL_VALUATIONS = [
  { lotSizeSqFt: 15000, assessedValue: 120000, state: 'GA', canopyPct: 30, buildingSqFt: 2200, yearBuilt: 2005, propertyType: 'singleFamily' },
  { lotSizeSqFt: 43560, assessedValue: 400000, state: 'GA', canopyPct: 15, buildingSqFt: 5000, yearBuilt: 1990, propertyType: 'singleFamily', zoning: 'R-1' },
  { lotSizeSqFt: 87120, assessedValue: 800000, state: 'GA', canopyPct: 40, buildingSqFt: 10000, yearBuilt: 2015, propertyType: 'singleFamily', zoning: 'MU-1' },
];

// ─── Tests ───────────────────────────────────────────────────

describe('EcosystemServices.calculate parity', () => {
  for (const [name, parcel] of Object.entries(PARCELS)) {
    it(`matches for parcel: ${name}`, () => {
      const lib = Lib.EcosystemServices.calculate(parcel);
      const orig = Orig.EcosystemServices.calculate(parcel);

      assert.equal(lib.totalAnnual, orig.totalAnnual, 'totalAnnual mismatch');
      assert.equal(lib.services.carbon.value, orig.services.carbon.value, 'carbon mismatch');
      assert.equal(lib.services.stormwater.value, orig.services.stormwater.value, 'stormwater mismatch');
      assert.equal(lib.services.airQuality.value, orig.services.airQuality.value, 'airQuality mismatch');
      assert.equal(lib.services.energy.value, orig.services.energy.value, 'energy mismatch');
      assert.equal(lib.services.habitat.value, orig.services.habitat.value, 'habitat mismatch');
      assert.equal(lib.services.propertyPremium.value, orig.services.propertyPremium.value, 'propertyPremium mismatch');
      assert.equal(lib.methodology, orig.methodology, 'methodology version mismatch');
      assert.deepEqual(lib.parcelMetrics, orig.parcelMetrics, 'parcelMetrics mismatch');
    });
  }
});

describe('LandAppreciation.project parity', () => {
  for (let i = 0; i < PROJECTIONS.length; i++) {
    it(`matches for projection scenario ${i + 1}`, () => {
      const lib = Lib.LandAppreciation.project(PROJECTIONS[i]);
      const orig = Orig.LandAppreciation.project(PROJECTIONS[i]);

      assert.deepEqual(lib.summary, orig.summary, 'summary mismatch');
      assert.deepEqual(lib.canopyChange, orig.canopyChange, 'canopyChange mismatch');
      assert.deepEqual(lib.propertyImpact, orig.propertyImpact, 'propertyImpact mismatch');
      assert.deepEqual(lib.ecosystemValue, orig.ecosystemValue, 'ecosystemValue mismatch');
      assert.deepEqual(lib.totalImpact, orig.totalImpact, 'totalImpact mismatch');
      assert.deepEqual(lib.sustainabilityValue, orig.sustainabilityValue, 'sustainabilityValue mismatch');
    });
  }
});

describe('CertificationPathway.assess parity', () => {
  for (const [name, siteData] of Object.entries(SITE_DATA)) {
    it(`matches for site: ${name}`, () => {
      const lib = Lib.CertificationPathway.assess(siteData);
      const orig = Orig.CertificationPathway.assess(siteData);

      for (const certKey of ['leed', 'breeam', 'well', 'greenGlobes']) {
        assert.deepEqual(lib[certKey].summary, orig[certKey].summary, `${certKey} summary mismatch`);
        assert.deepEqual(lib[certKey].prerequisites, orig[certKey].prerequisites, `${certKey} prerequisites mismatch`);

        // Compare individual credit statuses
        for (let c = 0; c < lib[certKey].credits.length; c++) {
          assert.equal(lib[certKey].credits[c].status, orig[certKey].credits[c].status,
            `${certKey} credit ${c} status mismatch`);
          assert.equal(lib[certKey].credits[c].progressPct, orig[certKey].credits[c].progressPct,
            `${certKey} credit ${c} progressPct mismatch`);
        }
      }
    });
  }
});

describe('LandValuation.fullValuation parity', () => {
  for (let i = 0; i < FULL_VALUATIONS.length; i++) {
    it(`matches for valuation scenario ${i + 1}`, () => {
      const lib = Lib.LandValuation.fullValuation(FULL_VALUATIONS[i]);
      const orig = Orig.LandValuation.fullValuation(FULL_VALUATIONS[i]);

      // Core reconciled value
      assert.equal(lib.valuation.reconciledValue, orig.valuation.reconciledValue, 'reconciledValue mismatch');
      assert.deepEqual(lib.valuation.valueRange, orig.valuation.valueRange, 'valueRange mismatch');
      assert.deepEqual(lib.valuation.weights, orig.valuation.weights, 'weights mismatch');

      // Ecosystem services
      assert.equal(lib.ecosystemServices.annualValue, orig.ecosystemServices.annualValue, 'eco annualValue mismatch');

      // Key metrics
      assert.equal(lib.keyMetrics.pricePerSqFt, orig.keyMetrics.pricePerSqFt, 'pricePerSqFt mismatch');
      assert.equal(lib.keyMetrics.ecosystemPremiumPct, orig.keyMetrics.ecosystemPremiumPct, 'ecosystemPremiumPct mismatch');

      // Data quality
      assert.deepEqual(lib.dataQuality, orig.dataQuality, 'dataQuality mismatch');

      // Version
      assert.equal(lib.version, orig.version, 'version mismatch');
    });
  }
});

describe('Static constant exposure parity', () => {
  it('ECOSYSTEM_SERVICE_RATES rates match', () => {
    for (const key of ['carbon', 'stormwater', 'airQuality', 'energy', 'habitat']) {
      assert.equal(
        Lib.ECOSYSTEM_SERVICE_RATES[key].ratePerCanopyAcre,
        Orig.ECOSYSTEM_SERVICE_RATES[key].ratePerCanopyAcre,
        `${key} rate mismatch`
      );
    }
    assert.equal(
      Lib.ECOSYSTEM_SERVICE_RATES.propertyPremium.premiumPct,
      Orig.ECOSYSTEM_SERVICE_RATES.propertyPremium.premiumPct,
      'propertyPremium rate mismatch'
    );
  });

  it('CERTIFICATIONS structure matches', () => {
    for (const certKey of ['leed', 'breeam', 'well', 'greenGlobes']) {
      assert.equal(Lib.CERTIFICATIONS[certKey].name, Orig.CERTIFICATIONS[certKey].name, `${certKey} name mismatch`);
      assert.equal(Lib.CERTIFICATIONS[certKey].organization, Orig.CERTIFICATIONS[certKey].organization, `${certKey} org mismatch`);
      assert.equal(
        Lib.CERTIFICATIONS[certKey].greenInfraCredits.length,
        Orig.CERTIFICATIONS[certKey].greenInfraCredits.length,
        `${certKey} credits count mismatch`
      );
    }
  });

  it('LAND_VALUATION_CONSTANTS key values match', () => {
    assert.equal(Lib.LAND_VALUATION_CONSTANTS.georgia.assessmentRatio, Orig.LAND_VALUATION_CONSTANTS.georgia.assessmentRatio);
    assert.equal(Lib.LAND_VALUATION_CONSTANTS.capRates.singleFamily.mid, Orig.LAND_VALUATION_CONSTANTS.capRates.singleFamily.mid);
    assert.equal(Lib.LAND_VALUATION_CONSTANTS.ecosystemPremium.annualServicesPerCanopyAcre, Orig.LAND_VALUATION_CONSTANTS.ecosystemPremium.annualServicesPerCanopyAcre);
    assert.equal(Lib.LAND_VALUATION_CONSTANTS.comparableAdjustments.canopyPremiumPer10pct, Orig.LAND_VALUATION_CONSTANTS.comparableAdjustments.canopyPremiumPer10pct);
  });
});

describe('API router integration', () => {
  const http = require('http');
  const handler = require('../api/index');
  let server, port;

  it('starts server and tests all routes', async () => {
    // Start server
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // Helper
    async function post(path, body) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
          hostname: '127.0.0.1', port, path, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }

    // /api/ecosystem
    const eco = await post('/api/ecosystem', PARCELS.roswell);
    assert.equal(eco.status, 200);
    assert.equal(eco.body.totalAnnual, Orig.EcosystemServices.calculate(PARCELS.roswell).totalAnnual);

    // /api/appreciation
    const app = await post('/api/appreciation', PROJECTIONS[0]);
    assert.equal(app.status, 200);
    assert.equal(app.body.totalImpact.withMarketAppreciation,
      Orig.LandAppreciation.project(PROJECTIONS[0]).totalImpact.withMarketAppreciation);

    // /api/land-valuation
    const lv = await post('/api/land-valuation', FULL_VALUATIONS[0]);
    assert.equal(lv.status, 200);
    assert.equal(lv.body.valuation.reconciledValue,
      Orig.LandValuation.fullValuation(FULL_VALUATIONS[0]).valuation.reconciledValue);

    // Validation error
    const bad = await post('/api/ecosystem', { canopyPct: 35 });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.message.includes('Missing required fields'));

    server.close();
  });
});

describe('API key authentication', () => {
  const http = require('http');
  const handler = require('../api/index');
  let server, port;

  function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port, path, method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it('allows localhost requests without key even when TERRAVALUE_API_KEY is set', async () => {
    process.env.TERRAVALUE_API_KEY = 'test-secret-key-12345';
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // localhost should pass without key
    const eco = await request('POST', '/api/ecosystem', PARCELS.roswell);
    assert.equal(eco.status, 200);

    server.close();
    delete process.env.TERRAVALUE_API_KEY;
  });

  it('rejects external requests without key when TERRAVALUE_API_KEY is set', async () => {
    process.env.TERRAVALUE_API_KEY = 'test-secret-key-12345';
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // Simulate external request by setting a different Origin
    const eco = await request('POST', '/api/ecosystem', PARCELS.roswell, {
      'Origin': 'https://external-site.com',
      'Host': 'api.terravalue.com',
    });
    assert.equal(eco.status, 401);
    assert.ok(eco.body.message.includes('X-API-Key'));

    server.close();
    delete process.env.TERRAVALUE_API_KEY;
  });

  it('accepts external requests with valid key', async () => {
    process.env.TERRAVALUE_API_KEY = 'test-secret-key-12345';
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const eco = await request('POST', '/api/ecosystem', PARCELS.roswell, {
      'Origin': 'https://external-site.com',
      'Host': 'api.terravalue.com',
      'X-API-Key': 'test-secret-key-12345',
    });
    assert.equal(eco.status, 200);
    assert.ok(eco.body.totalAnnual > 0);

    server.close();
    delete process.env.TERRAVALUE_API_KEY;
  });

  it('rejects external requests with wrong key', async () => {
    process.env.TERRAVALUE_API_KEY = 'test-secret-key-12345';
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const eco = await request('POST', '/api/ecosystem', PARCELS.roswell, {
      'Origin': 'https://external-site.com',
      'Host': 'api.terravalue.com',
      'X-API-Key': 'wrong-key',
    });
    assert.equal(eco.status, 401);
    assert.ok(eco.body.message.includes('Invalid'));

    server.close();
    delete process.env.TERRAVALUE_API_KEY;
  });

  it('health endpoint is always public even with key configured', async () => {
    process.env.TERRAVALUE_API_KEY = 'test-secret-key-12345';
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const health = await request('GET', '/api/health', null, {
      'Origin': 'https://external-site.com',
      'Host': 'api.terravalue.com',
    });
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');

    server.close();
    delete process.env.TERRAVALUE_API_KEY;
  });

  it('allows all requests when TERRAVALUE_API_KEY is not set', async () => {
    delete process.env.TERRAVALUE_API_KEY;
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // External request without key should pass when no key is configured
    const eco = await request('POST', '/api/ecosystem', PARCELS.roswell, {
      'Origin': 'https://external-site.com',
      'Host': 'api.terravalue.com',
    });
    assert.equal(eco.status, 200);

    server.close();
  });
});
