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

/**
 * Validate and coerce a single field.
 *
 * Coercion rules (per audit AUDIT-2026-05-20.md, finding F2):
 *   - Accepts numbers and clean numeric strings ("43560" -> 43560).
 *   - Rejects NaN, Infinity, mixed strings ("43560abc"), empty strings, booleans.
 *   - Range-checks against {min, max}; out-of-range returns 400.
 *
 * @param {*} value       — raw value from body
 * @param {Object} spec   — { name, min, max, required, integer, allowedValues }
 * @returns {{ ok: true, value: number|string } | { ok: false, error: string }}
 */
function validateField(value, spec) {
  const { name, min, max, required = false, integer = false, allowedValues, type = 'number' } = spec;

  // Missing value handling
  if (value == null || value === '') {
    if (required) return { ok: false, error: `${name} is required` };
    return { ok: true, value: undefined };
  }

  // String-allowed values (enums like state, propertyType)
  if (type === 'string') {
    if (typeof value !== 'string') {
      return { ok: false, error: `${name} must be a string` };
    }
    if (allowedValues && !allowedValues.includes(value)) {
      return { ok: false, error: `${name} must be one of: ${allowedValues.join(', ')}` };
    }
    return { ok: true, value };
  }

  // Numeric coercion: accept numbers and clean numeric strings only.
  // Reject booleans (Number(true) === 1, which would silently coerce to a valid number).
  if (typeof value === 'boolean') {
    return { ok: false, error: `${name} must be a number (got boolean)` };
  }

  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    // Trim whitespace, then require the string to be a complete numeric literal.
    // Number("43560") === 43560 OK
    // Number("43560abc") === NaN (caught below)
    // Number("") === 0 (caught: trim then check length)
    // Number(" ") === 0 (caught: trim then check length)
    const trimmed = value.trim();
    if (trimmed === '') {
      return { ok: false, error: `${name} must be a number (got empty string)` };
    }
    n = Number(trimmed);
  } else {
    return { ok: false, error: `${name} must be a number` };
  }

  if (!Number.isFinite(n)) {
    return { ok: false, error: `${name} must be a finite number (got ${JSON.stringify(value)})` };
  }

  if (integer && !Number.isInteger(n)) {
    return { ok: false, error: `${name} must be an integer (got ${n})` };
  }

  if (min != null && n < min) {
    return { ok: false, error: `${name} must be >= ${min} (got ${n})` };
  }
  if (max != null && n > max) {
    return { ok: false, error: `${name} must be <= ${max} (got ${n})` };
  }

  return { ok: true, value: n };
}

/**
 * Validate a whole body against a schema. Returns { ok, errors[], values{} }.
 * Collects ALL errors before returning (rather than short-circuiting), so the
 * caller sees every problem in one round-trip.
 */
function validateBody(body, schema) {
  const errors = [];
  const values = {};
  for (const [field, spec] of Object.entries(schema)) {
    const result = validateField(body[field], { ...spec, name: field });
    if (!result.ok) {
      errors.push(result.error);
    } else if (result.value !== undefined) {
      values[field] = result.value;
    }
  }
  return { ok: errors.length === 0, errors, values };
}

/**
 * Build a validation-error response body. Returns the structure the API uses
 * for 400s.
 */
function validationErrorResponse(errors) {
  return {
    status: 400,
    body: {
      error: true,
      message: 'Validation failed',
      validationErrors: errors,
    },
  };
}

// ─── Field Schemas ───────────────────────────────────────────
//
// Centralized so the validation rules are visible in one place. Each handler
// references its schema below. Ranges are deliberately wide enough to cover
// realistic inputs and narrow enough to catch obvious errors (negative canopy,
// out-of-100% canopy, negative lot size, etc.).
//
// Ranges sourced from:
//   - lotSizeSqFt: 1 sqft to 10M sqft (~230 acres). Larger usually means unit error.
//   - canopyPct: 0-100 inclusive. No such thing as negative or >100% canopy.
//   - assessedValue: 0 to $1B. Zero is legitimate for vacant land.
//   - currentScore/projectedScore: 0-100 (Soil Score range).
//   - timelineYears: 1-100. Longer projections are unreliable.
//   - canopySource: enum, optional.
//   - state: 2-letter string, optional (defaults to 'GA' in handlers).
//   - condition/locationQuality: 1-5 (engine's 1-5 ordinal scale).
//   - yearBuilt: 1700-current. Older usually means data error.

const NUMERIC = {
  lotSizeSqFt:     { min: 1, max: 10_000_000, required: true },
  canopyPct:       { min: 0, max: 100,         required: true },
  assessedValue:   { min: 0, max: 1_000_000_000, required: true },
  // Land-valuation optional numerics:
  buildingSqFt:    { min: 0, max: 1_000_000 },
  yearBuilt:       { min: 1700, max: new Date().getFullYear() + 5, integer: true },
  condition:       { min: 1, max: 5, integer: true },
  locationQuality: { min: 1, max: 5, integer: true },
  grossPotentialIncome: { min: 0, max: 100_000_000 },
  // Appreciation:
  currentScore:    { min: 0, max: 100, required: true },
  projectedScore:  { min: 0, max: 100, required: true },
  timelineYears:   { min: 1, max: 100, required: true, integer: true },
  propertyValue:   { min: 0, max: 1_000_000_000, required: true },
  currentCanopyPct: { min: 0, max: 100 },
  baseAppreciationRate: { min: -0.5, max: 0.5 },  // -50% to +50% annual is the realistic envelope
  // Valuation:
  taxYear:         { min: 1900, max: new Date().getFullYear() + 5, integer: true },
  assessmentRatio: { min: 0.01, max: 1.0 },
  // Certifications:
  biodiversityNetGainPct: { min: 0, max: 100 },
  plantWallPct:    { min: 0, max: 100 },
  pottedPlantPct:  { min: 0, max: 100 },
};

const STRING = {
  state:          { type: 'string' },  // not strictly validated; engine handles 'GA' specially
  propertyType:   { type: 'string', allowedValues: ['singleFamily', 'multifamily', 'retail', 'office', 'industrial', 'mixedUse', 'vacantLand'] },
  canopySource:   { type: 'string', allowedValues: ['measured', 'estimated'] },
  zoning:         { type: 'string' },  // free-form; engine's _getZoningUses parses prefix
};

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
  const v = validateBody(body, {
    lotSizeSqFt:  NUMERIC.lotSizeSqFt,
    canopyPct:    NUMERIC.canopyPct,
    assessedValue: NUMERIC.assessedValue,
    state:        STRING.state,
    canopySource: STRING.canopySource,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  const result = TerraValueEngine.EcosystemServices.calculate({
    lotSizeSqFt: v.values.lotSizeSqFt,
    canopyPct: v.values.canopyPct,
    assessedValue: v.values.assessedValue,
    state: v.values.state || 'GA',
  });

  return { status: 200, body: {
    ...result,
    dataQuality: buildDataQuality({
      canopySource: v.values.canopySource,
      baseNote: 'Calculation uses peer-reviewed rates from config',
    }),
    route: '/api/ecosystem',
  } };
}

async function handleCertifications(body) {
  // canopyPct is optional here (engine accepts undefined for sites without canopy data)
  // but if supplied, it must be in range.
  const v = validateBody(body, {
    canopyPct:              { ...NUMERIC.canopyPct, required: false },
    biodiversityNetGainPct: NUMERIC.biodiversityNetGainPct,
    plantWallPct:           NUMERIC.plantWallPct,
    pottedPlantPct:         NUMERIC.pottedPlantPct,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  const siteData = {
    canopyPct: v.values.canopyPct,
    hasGreenInfrastructure: body.hasGreenInfrastructure === true,  // strict bool
    biodiversityNetGainPct: v.values.biodiversityNetGainPct,
    plantWallPct: v.values.plantWallPct != null ? v.values.plantWallPct : 0,
    pottedPlantPct: v.values.pottedPlantPct != null ? v.values.pottedPlantPct : 0,
    hasErosionPlan: body.hasErosionPlan === true,
    hasBiophiliaPlan: body.hasBiophiliaPlan === true,
  };

  const targets = Array.isArray(body.targetCertifications)
    ? body.targetCertifications
    : ['leed', 'breeam', 'well', 'greenGlobes'];
  const result = TerraValueEngine.CertificationPathway.assess(siteData, targets);

  return { status: 200, body: {
    certifications: result,
    dataQuality: { confidence: 'moderate', syntheticDataUsed: false, note: 'Assessment based on provided site data — actual certification requires accredited assessor' },
    route: '/api/certifications',
  } };
}

async function handleValuation(body) {
  const v = validateBody(body, {
    assessedValue:   NUMERIC.assessedValue,
    taxYear:         NUMERIC.taxYear,
    assessmentRatio: NUMERIC.assessmentRatio,
    state:           STRING.state,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  // address is free-form string; no range check, but require string if present
  if (body.address != null && typeof body.address !== 'string') {
    return validationErrorResponse(['address must be a string']);
  }

  const parcelData = {
    assessedValue: v.values.assessedValue,
    state: v.values.state || 'GA',
    address: body.address,
    taxYear: v.values.taxYear,
  };

  const options = {
    enableRedfin: body.enableRedfin !== false,
    assessmentRatio: v.values.assessmentRatio,
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
  const v = validateBody(body, {
    currentScore:    NUMERIC.currentScore,
    projectedScore:  NUMERIC.projectedScore,
    timelineYears:   NUMERIC.timelineYears,
    propertyValue:   NUMERIC.propertyValue,
    currentCanopyPct: NUMERIC.currentCanopyPct,
    lotSizeSqFt:     { ...NUMERIC.lotSizeSqFt, required: false },
    baseAppreciationRate: NUMERIC.baseAppreciationRate,
    canopySource:    STRING.canopySource,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  // Track which optional inputs fall through to server-side defaults.
  // These get surfaced in dataQuality.assumptionsApplied so the caller knows.
  const assumptionsApplied = [];
  const currentCanopyPct = v.values.currentCanopyPct != null
    ? v.values.currentCanopyPct
    : (assumptionsApplied.push('currentCanopyPct=25 (US suburban median)'), 25);
  const lotSizeSqFt = v.values.lotSizeSqFt != null
    ? v.values.lotSizeSqFt
    : (assumptionsApplied.push('lotSizeSqFt=15000 (typical SFR lot)'), 15000);
  const baseAppreciationRate = v.values.baseAppreciationRate != null
    ? v.values.baseAppreciationRate
    : (assumptionsApplied.push('baseAppreciationRate=0.035 (FHFA HPI long-term avg)'), 0.035);

  const result = TerraValueEngine.LandAppreciation.project({
    currentScore: v.values.currentScore,
    projectedScore: v.values.projectedScore,
    timelineYears: v.values.timelineYears,
    propertyValue: v.values.propertyValue,
    currentCanopyPct,
    lotSizeSqFt,
    baseAppreciationRate,
  });

  return { status: 200, body: {
    ...result,
    dataQuality: buildDataQuality({
      assumptionsApplied,
      canopySource: v.values.canopySource,
      baseNote: 'Projection uses peer-reviewed coefficients with linear interpolation — directional estimate',
    }),
    route: '/api/appreciation',
  } };
}

async function handleLandValuation(body) {
  const v = validateBody(body, {
    lotSizeSqFt:     NUMERIC.lotSizeSqFt,
    assessedValue:   NUMERIC.assessedValue,
    canopyPct:       { ...NUMERIC.canopyPct, required: false },
    buildingSqFt:    NUMERIC.buildingSqFt,
    yearBuilt:       NUMERIC.yearBuilt,
    condition:       NUMERIC.condition,
    locationQuality: NUMERIC.locationQuality,
    grossPotentialIncome: NUMERIC.grossPotentialIncome,
    state:           STRING.state,
    propertyType:    STRING.propertyType,
    zoning:          STRING.zoning,
    canopySource:    STRING.canopySource,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  if (body.comparables != null && !Array.isArray(body.comparables)) {
    return validationErrorResponse(['comparables must be an array']);
  }

  // Track API-layer defaults that the engine's own dataQuality won't catch.
  // The engine flags missing comparables and missing grossPotentialIncome internally.
  // Here we additionally surface defaulted condition/locationQuality/canopyPct.
  const apiAssumptions = [];
  if (v.values.condition == null)       apiAssumptions.push('condition=3 (median)');
  if (v.values.locationQuality == null) apiAssumptions.push('locationQuality=3 (median)');
  if (v.values.canopyPct == null)       apiAssumptions.push('canopyPct=0 (no canopy data supplied)');
  if (v.values.buildingSqFt == null)    apiAssumptions.push('buildingSqFt=0 (treated as vacant land)');

  const parcel = {
    lotSizeSqFt: v.values.lotSizeSqFt,
    assessedValue: v.values.assessedValue,
    state: v.values.state || 'GA',
    canopyPct: v.values.canopyPct != null ? v.values.canopyPct : 0,
    buildingSqFt: v.values.buildingSqFt != null ? v.values.buildingSqFt : 0,
    yearBuilt: v.values.yearBuilt,
    propertyType: v.values.propertyType || 'singleFamily',
    comparables: body.comparables || [],
    grossPotentialIncome: v.values.grossPotentialIncome,
    condition: v.values.condition != null ? v.values.condition : 3,
    locationQuality: v.values.locationQuality != null ? v.values.locationQuality : 3,
    zoning: v.values.zoning || 'R-1',
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
  const v = validateBody(body, {
    lotSizeSqFt:     NUMERIC.lotSizeSqFt,
    canopyPct:       NUMERIC.canopyPct,
    assessedValue:   NUMERIC.assessedValue,
    buildingSqFt:    NUMERIC.buildingSqFt,
    yearBuilt:       NUMERIC.yearBuilt,
    condition:       NUMERIC.condition,
    locationQuality: NUMERIC.locationQuality,
    grossPotentialIncome: NUMERIC.grossPotentialIncome,
    state:           STRING.state,
    propertyType:    STRING.propertyType,
    zoning:          STRING.zoning,
    canopySource:    STRING.canopySource,
  });
  if (!v.ok) return validationErrorResponse(v.errors);

  if (body.comparables != null && !Array.isArray(body.comparables)) {
    return validationErrorResponse(['comparables must be an array']);
  }
  if (body.certificationData != null && (typeof body.certificationData !== 'object' || Array.isArray(body.certificationData))) {
    return validationErrorResponse(['certificationData must be an object']);
  }

  const parcelData = {
    lotSizeSqFt: v.values.lotSizeSqFt,
    canopyPct: v.values.canopyPct,
    assessedValue: v.values.assessedValue,
    state: v.values.state || 'GA',
    address: typeof body.address === 'string' ? body.address : undefined,
    buildingSqFt: v.values.buildingSqFt != null ? v.values.buildingSqFt : 0,
    yearBuilt: v.values.yearBuilt,
    propertyType: v.values.propertyType || 'singleFamily',
    zoning: v.values.zoning || 'R-1',
    certificationData: body.certificationData || {},
  };

  const engine = new TerraValueEngine();
  const result = await engine.analyze(parcelData);

  // Track land-valuation defaults the API layer adds (separate from engine.analyze).
  const landValAssumptions = [];

  // Add land valuation. (Required fields lotSizeSqFt + assessedValue are
  // already validated above, so this branch always runs.)
  if (v.values.condition == null)       landValAssumptions.push('condition=3 (median)');
  if (v.values.locationQuality == null) landValAssumptions.push('locationQuality=3 (median)');
  if (!body.comparables || body.comparables.length === 0) {
    landValAssumptions.push('comparables=[] (synthetic comps will be generated)');
  }
  if (v.values.grossPotentialIncome == null) {
    landValAssumptions.push('grossPotentialIncome estimated as 6.5% of market value');
  }

  result.landValuation = TerraValueEngine.LandValuation.fullValuation({
    ...parcelData,
    comparables: body.comparables || [],
    grossPotentialIncome: v.values.grossPotentialIncome,
    condition: v.values.condition != null ? v.values.condition : 3,
    locationQuality: v.values.locationQuality != null ? v.values.locationQuality : 3,
  });

  // Merge engine-level + API-level assumptions into one dataQuality block.
  // engine.analyze() returns a dataQuality with assumptionsApplied[]; we extend it.
  const allAssumptions = [
    ...((result.dataQuality && result.dataQuality.assumptionsApplied) || []),
    ...landValAssumptions,
  ];
  result.dataQuality = buildDataQuality({
    assumptionsApplied: allAssumptions,
    canopySource: v.values.canopySource,
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
