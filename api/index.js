/**
 * TerraValue API — Unified Router
 *
 * Single serverless function that handles all API routes.
 * Vercel routes all /api/* requests here via vercel.json rewrite.
 *
 * Routes:
 *   POST /api/ecosystem       — EcosystemServices.calculate()
 *   POST /api/certifications  — CertificationPathway.assess()
 *   POST /api/valuation       — PropertyValuation.getCompositeValue()
 *   POST /api/appreciation    — LandAppreciation.project()
 *   POST /api/land-valuation  — LandValuation.fullValuation()
 *   POST /api/analyze         — Full analysis (orchestrator)
 *   GET  /api/health          — Health check
 */

const TerraValueEngine = require('../lib/terravalue-engine');

// ─── API Key Authentication ─────────────────────────────────
//
// External consumers must include X-API-Key header.
// Same-origin requests (Referer matches host, or Origin matches) skip auth.
// Health endpoint is always public.
// Set TERRAVALUE_API_KEY env var on Vercel to enable.
//

function isSameOrigin(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';

  // If origin header is present and matches the host
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch (_) { /* ignore parse errors */ }
  }

  // If referer header matches the host
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host) return true;
    } catch (_) { /* ignore parse errors */ }
  }

  // localhost/dev always passes (no auth needed locally)
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;

  return false;
}

function authenticate(req, path) {
  // Health endpoint is always public
  if (path === '/api/health') return null;

  // If no API key is configured, auth is disabled (open access)
  const apiKey = process.env.TERRAVALUE_API_KEY;
  if (!apiKey) return null;

  // Same-origin requests skip auth (frontend calls)
  if (isSameOrigin(req)) return null;

  // External requests must provide the key
  const provided = req.headers['x-api-key'];
  if (!provided) {
    return 'Missing X-API-Key header. See docs for API access.';
  }

  // Constant-time comparison to prevent timing attacks
  if (provided.length !== apiKey.length) {
    return 'Invalid API key';
  }
  let mismatch = 0;
  for (let i = 0; i < apiKey.length; i++) {
    mismatch |= apiKey.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return 'Invalid API key';
  }

  return null; // Authenticated
}

// ─── CORS & Response Helpers ─────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function error(res, statusCode, message, details = null) {
  const body = {
    error: true,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  };
  json(res, statusCode, body);
}

// ─── Input Validation ────────────────────────────────────────

function requireFields(body, fields) {
  const missing = fields.filter(f => body[f] == null);
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel already parses JSON bodies, but handle raw too
    if (req.body) {
      resolve(req.body);
      return;
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Route Handlers ──────────────────────────────────────────

/**
 * Build a consistent dataQuality block for any handler.
 *
 * Confidence is derived from inputs, not declared:
 *   - 'high'     → all required inputs were supplied AND canopySource === 'measured'
 *   - 'moderate' → all required inputs supplied but canopy is estimated, OR 1 default applied
 *   - 'low'      → 2+ defaults applied, or no source info
 *
 * `assumptionsApplied` lists every field where a server-side default fired,
 * so consumers can warn the user that the result depends on synthesized inputs.
 */
function buildDataQuality({
  assumptionsApplied = [],
  canopySource,           // 'measured' | 'estimated' | undefined
  baseNote,
} = {}) {
  const synthetic = assumptionsApplied.length > 0;
  let confidence;
  if (assumptionsApplied.length >= 2) {
    confidence = 'low';
  } else if (assumptionsApplied.length === 1 || canopySource === 'estimated' || !canopySource) {
    confidence = 'moderate';
  } else {
    confidence = 'high';
  }

  const notes = [];
  if (baseNote) notes.push(baseNote);
  if (synthetic) {
    notes.push(`Server-side defaults applied for: ${assumptionsApplied.join(', ')}`);
  }
  if (!canopySource) {
    notes.push('canopySource not provided — confidence capped at moderate');
  }

  return {
    confidence,
    syntheticDataUsed: synthetic,
    assumptionsApplied,
    canopySource: canopySource || null,
    note: notes.join(' | '),
  };
}

async function handleEcosystem(body) {
  const err = requireFields(body, ['lotSizeSqFt', 'canopyPct', 'assessedValue']);
  if (err) return { status: 400, body: { error: true, message: err } };

  const result = TerraValueEngine.EcosystemServices.calculate({
    lotSizeSqFt: Number(body.lotSizeSqFt),
    canopyPct: Number(body.canopyPct),
    assessedValue: Number(body.assessedValue),
    state: body.state || 'GA',
  });

  return { status: 200, body: {
    ...result,
    dataQuality: buildDataQuality({
      canopySource: body.canopySource,
      baseNote: 'Calculation uses peer-reviewed rates from config',
    }),
    route: '/api/ecosystem',
  } };
}

async function handleCertifications(body) {
  const siteData = {
    canopyPct: body.canopyPct != null ? Number(body.canopyPct) : undefined,
    hasGreenInfrastructure: body.hasGreenInfrastructure,
    biodiversityNetGainPct: body.biodiversityNetGainPct != null ? Number(body.biodiversityNetGainPct) : undefined,
    plantWallPct: body.plantWallPct != null ? Number(body.plantWallPct) : 0,
    pottedPlantPct: body.pottedPlantPct != null ? Number(body.pottedPlantPct) : 0,
    hasErosionPlan: body.hasErosionPlan || false,
    hasBiophiliaPlan: body.hasBiophiliaPlan || false,
  };

  const targets = body.targetCertifications || ['leed', 'breeam', 'well', 'greenGlobes'];
  const result = TerraValueEngine.CertificationPathway.assess(siteData, targets);

  return { status: 200, body: {
    certifications: result,
    dataQuality: { confidence: 'moderate', syntheticDataUsed: false, note: 'Assessment based on provided site data — actual certification requires accredited assessor' },
    route: '/api/certifications',
  } };
}

async function handleValuation(body) {
  const err = requireFields(body, ['assessedValue']);
  if (err) return { status: 400, body: { error: true, message: err } };

  const parcelData = {
    assessedValue: Number(body.assessedValue),
    state: body.state || 'GA',
    address: body.address,
    taxYear: body.taxYear,
  };

  const options = {
    enableRedfin: body.enableRedfin !== false,
    assessmentRatio: body.assessmentRatio ? Number(body.assessmentRatio) : undefined,
  };

  const result = await TerraValueEngine.PropertyValuation.getCompositeValue(parcelData, options);

  const sourceCount = result.sourceCount || 0;
  return { status: 200, body: {
    ...result,
    dataQuality: {
      confidence: sourceCount >= 2 ? 'high' : sourceCount === 1 ? 'moderate' : 'low',
      syntheticDataUsed: false,
      sourceCount,
      note: sourceCount === 0 ? 'No valuation sources available' : `${sourceCount} valuation source(s) used`,
    },
    route: '/api/valuation',
  } };
}

async function handleAppreciation(body) {
  const err = requireFields(body, ['currentScore', 'projectedScore', 'timelineYears', 'propertyValue']);
  if (err) return { status: 400, body: { error: true, message: err } };

  // Track which optional inputs fall through to server-side defaults.
  // These get surfaced in dataQuality.assumptionsApplied so the caller knows.
  const assumptionsApplied = [];
  let currentCanopyPct;
  if (body.currentCanopyPct != null) {
    currentCanopyPct = Number(body.currentCanopyPct);
  } else {
    currentCanopyPct = 25;
    assumptionsApplied.push('currentCanopyPct=25 (US suburban median)');
  }
  let lotSizeSqFt;
  if (body.lotSizeSqFt != null) {
    lotSizeSqFt = Number(body.lotSizeSqFt);
  } else {
    lotSizeSqFt = 15000;
    assumptionsApplied.push('lotSizeSqFt=15000 (typical SFR lot)');
  }
  let baseAppreciationRate;
  if (body.baseAppreciationRate != null) {
    baseAppreciationRate = Number(body.baseAppreciationRate);
  } else {
    baseAppreciationRate = 0.035;
    assumptionsApplied.push('baseAppreciationRate=0.035 (FHFA HPI long-term avg)');
  }

  const result = TerraValueEngine.LandAppreciation.project({
    currentScore: Number(body.currentScore),
    projectedScore: Number(body.projectedScore),
    timelineYears: Number(body.timelineYears),
    propertyValue: Number(body.propertyValue),
    currentCanopyPct,
    lotSizeSqFt,
    baseAppreciationRate,
  });

  return { status: 200, body: {
    ...result,
    dataQuality: buildDataQuality({
      assumptionsApplied,
      canopySource: body.canopySource,
      baseNote: 'Projection uses peer-reviewed coefficients with linear interpolation — directional estimate',
    }),
    route: '/api/appreciation',
  } };
}

async function handleLandValuation(body) {
  const err = requireFields(body, ['lotSizeSqFt', 'assessedValue']);
  if (err) return { status: 400, body: { error: true, message: err } };

  // Track API-layer defaults that the engine's own dataQuality won't catch.
  // The engine flags missing comparables and missing grossPotentialIncome internally.
  // Here we additionally surface defaulted condition/locationQuality/canopyPct.
  const apiAssumptions = [];
  if (body.condition == null) apiAssumptions.push('condition=3 (median)');
  if (body.locationQuality == null) apiAssumptions.push('locationQuality=3 (median)');
  if (body.canopyPct == null) apiAssumptions.push('canopyPct=0 (no canopy data supplied)');
  if (body.buildingSqFt == null) apiAssumptions.push('buildingSqFt=0 (treated as vacant land)');

  const parcel = {
    lotSizeSqFt: Number(body.lotSizeSqFt),
    assessedValue: Number(body.assessedValue),
    state: body.state || 'GA',
    canopyPct: body.canopyPct != null ? Number(body.canopyPct) : 0,
    buildingSqFt: body.buildingSqFt != null ? Number(body.buildingSqFt) : 0,
    yearBuilt: body.yearBuilt != null ? Number(body.yearBuilt) : undefined,
    propertyType: body.propertyType || 'singleFamily',
    comparables: body.comparables || [],
    grossPotentialIncome: body.grossPotentialIncome != null ? Number(body.grossPotentialIncome) : undefined,
    condition: body.condition != null ? Number(body.condition) : 3,
    locationQuality: body.locationQuality != null ? Number(body.locationQuality) : 3,
    zoning: body.zoning || 'R-1',
  };

  const result = TerraValueEngine.LandValuation.fullValuation(parcel);

  // Engine returns its own dataQuality with hasRealComparables/hasRealIncome/warnings[].
  // We append the API-layer assumptions to its warnings array so the UI sees them all.
  if (result.dataQuality && apiAssumptions.length > 0) {
    result.dataQuality = {
      ...result.dataQuality,
      apiLayerDefaults: apiAssumptions,
      syntheticDataUsed: true,
      warnings: [
        ...(result.dataQuality.warnings || []),
        ...apiAssumptions.map(a => `API default applied: ${a}`),
      ],
    };
  }

  return { status: 200, body: { ...result, route: '/api/land-valuation' } };
}

async function handleAnalyze(body) {
  const err = requireFields(body, ['lotSizeSqFt', 'canopyPct', 'assessedValue']);
  if (err) return { status: 400, body: { error: true, message: err } };

  const parcelData = {
    lotSizeSqFt: Number(body.lotSizeSqFt),
    canopyPct: Number(body.canopyPct),
    assessedValue: Number(body.assessedValue),
    state: body.state || 'GA',
    address: body.address,
    buildingSqFt: body.buildingSqFt != null ? Number(body.buildingSqFt) : 0,
    yearBuilt: body.yearBuilt != null ? Number(body.yearBuilt) : undefined,
    propertyType: body.propertyType || 'singleFamily',
    zoning: body.zoning || 'R-1',
    certificationData: body.certificationData || {},
  };

  const engine = new TerraValueEngine();
  const result = await engine.analyze(parcelData);

  // Track land-valuation defaults the API layer adds (separate from engine.analyze).
  const landValAssumptions = [];

  // Add land valuation if enough data
  if (body.lotSizeSqFt && body.assessedValue) {
    if (body.condition == null) landValAssumptions.push('condition=3 (median)');
    if (body.locationQuality == null) landValAssumptions.push('locationQuality=3 (median)');
    if (!body.comparables || body.comparables.length === 0) {
      landValAssumptions.push('comparables=[] (synthetic comps will be generated)');
    }
    if (body.grossPotentialIncome == null) {
      landValAssumptions.push('grossPotentialIncome estimated as 6.5% of market value');
    }

    result.landValuation = TerraValueEngine.LandValuation.fullValuation({
      ...parcelData,
      comparables: body.comparables || [],
      grossPotentialIncome: body.grossPotentialIncome != null ? Number(body.grossPotentialIncome) : undefined,
      condition: body.condition != null ? Number(body.condition) : 3,
      locationQuality: body.locationQuality != null ? Number(body.locationQuality) : 3,
    });
  }

  // Merge engine-level + API-level assumptions into one dataQuality block.
  // engine.analyze() now returns a dataQuality with assumptionsApplied[]; we extend it.
  const allAssumptions = [
    ...((result.dataQuality && result.dataQuality.assumptionsApplied) || []),
    ...landValAssumptions,
  ];
  result.dataQuality = buildDataQuality({
    assumptionsApplied: allAssumptions,
    canopySource: body.canopySource,
    baseNote: 'Full analysis: ecosystem + valuation + appreciation + certifications + (optional) land valuation',
  });

  return { status: 200, body: { ...result, route: '/api/analyze' } };
}

function handleHealth() {
  return {
    status: 200,
    body: {
      status: 'ok',
      engine: 'TerraValue',
      version: TerraValueEngine.EcosystemServices.calculate({
        lotSizeSqFt: 43560, canopyPct: 30, assessedValue: 100000, state: 'GA',
      }).methodology,
      routes: ['/api/ecosystem', '/api/certifications', '/api/valuation', '/api/appreciation', '/api/land-valuation', '/api/analyze', '/api/health'],
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Route Table ─────────────────────────────────────────────

const ROUTES = {
  '/api/ecosystem':      { handler: handleEcosystem, method: 'POST' },
  '/api/certifications': { handler: handleCertifications, method: 'POST' },
  '/api/valuation':      { handler: handleValuation, method: 'POST' },
  '/api/appreciation':   { handler: handleAppreciation, method: 'POST' },
  '/api/land-valuation': { handler: handleLandValuation, method: 'POST' },
  '/api/analyze':        { handler: handleAnalyze, method: 'POST' },
  '/api/health':         { handler: handleHealth, method: 'GET' },
};

// ─── Main Handler ────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Parse URL path
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/'; // Normalize trailing slash

  // Find route
  const route = ROUTES[path];

  if (!route) {
    return error(res, 404, `Route not found: ${path}`, {
      availableRoutes: Object.keys(ROUTES),
    });
  }

  // Method check (GET routes accept GET, POST routes accept POST)
  if (route.method === 'POST' && req.method !== 'POST') {
    return error(res, 405, `${path} requires POST`, { method: req.method });
  }

  // API key authentication
  const authError = authenticate(req, path);
  if (authError) {
    return error(res, 401, authError);
  }

  try {
    // Parse body for POST requests
    let body = {};
    if (req.method === 'POST') {
      body = await parseBody(req);
    }

    // Execute handler
    const result = await route.handler(body);
    json(res, result.status, result.body);
  } catch (err) {
    console.error(`[TerraValue API] Error on ${path}:`, err);
    error(res, 500, 'Internal server error', {
      route: path,
      error: err.message,
    });
  }
};
