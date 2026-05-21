> **STATUS: Archived 2026-05-20.** April 29, 2026 planning doc for the API extraction. The migration shipped May 4 (see SESSION-HANDOFF-2026-05-04.md). Kept for historical context only.

---

# TerraValue API Migration — Session Handoff
**Date:** April 29, 2026
**Purpose:** Drop this file (along with the `P&X/` project folder) into a new Cowork session to resume the API extraction work.

---

## What This Session Accomplished

### 1. Full Codebase Audit & Architecture Analysis

Read and mapped every line of `terravalue-engine.js` (2,345 lines). Identified all 7 modules, their internal dependencies, constant references, and frontend integration points.

### 2. Service Decomposition Design

Broke the monolithic engine into **5 bounded contexts** (services) plus a shared config layer:

| # | Service | Entry Point | Dependencies | Lines |
|---|---------|-------------|-------------|-------|
| 1 | **Property Valuation** | `PropertyValuation.getCompositeValue()` | None (fully independent) | ~100 |
| 2 | **Ecosystem Services** | `EcosystemServices.calculate()` | Shared config only | ~80 |
| 3 | **Appreciation Projector** | `LandAppreciation.project()` | Eco rates (config), SustainabilityValue (embedded) | ~150 |
| 4 | **Land Valuation (USPAP)** | `LandValuation.fullValuation()` | Shared config, calls EcosystemServices internally | ~900 |
| 5 | **Certification Pathway** | `CertificationPathway.assess()` | None (fully independent) | ~220 |

**Critical cross-class dependency found during audit:** `LandValuation.fullValuation()` (line 2057) calls `EcosystemServices.calculate()` directly for the ecosystem overlay. This must be preserved in the lib module.

### 3. Deployment Strategy Decision

Evaluated Python/FastAPI vs Node.js on Vercel. **Decision: Node.js first** (Option A) because:
- `terravalue-engine.js` already has `module.exports = TerraValueEngine` — runs in Node with zero changes
- Vercel's `api/` directory convention makes deployment trivial
- Ship working API this week, migrate to Python later behind the same API contract

### 4. Phase 1 Partially Completed

**Done:**
- Created `api/`, `lib/`, `config/`, `tests/` directories
- Created `package.json` (zero dependencies, Node ≥18, `node --test` script)
- Extracted all 5 constant blocks into `config/*.json` files (see below)
- Created `config/index.js` loader with computed `ECO_SERVICE_TOTAL_PER_ACRE` validation

**NOT done yet:**
- `lib/terravalue-engine.js` — the server-side engine that imports from `config/` instead of inlining constants. This is the next step.

---

## Project Structure (Current State)

```
P&X/
├── website/                          # Static frontend (unchanged)
│   ├── index.html                    # P&X homepage — calls engine at lines 1042, 1045
│   ├── terravalue.html               # TerraValue page — calls engine at lines 842, 883, 935
│   ├── terravalue-engine.js          # ORIGINAL monolithic engine (2,345 lines)
│   └── sitemap.xml
├── api/                              # NEW — serverless functions (empty, to be built)
├── lib/                              # NEW — shared Node module (to be built)
├── config/                           # NEW — externalized constants
│   ├── index.js                      # Config loader — exports all constants
│   ├── canopy-value-coefficients.json
│   ├── ecosystem-service-rates.json
│   ├── sustainability-metrics.json
│   ├── certifications.json
│   └── land-valuation-constants.json
├── tests/                            # NEW — test directory (empty, to be built)
├── package.json                      # NEW — zero-dep Node project
├── vercel.json                       # Existing — needs rewrite rules added
├── PX-Session-Handoff.md             # Previous session handoff
├── TerraValue-Audit-Report.md        # April 28 code audit
├── TerraValue-API-Migration-Handoff.md  # THIS FILE
├── PX-Partner-Overview.pdf
└── PX-Business-Plan.pdf
```

---

## Constant Extraction Map

Each constant block from `terravalue-engine.js` → its config file:

| Original Constant | Config File | Used By |
|---|---|---|
| `METHODOLOGY_VERSION` (line 23) | `config/index.js` (hardcoded `'1.0.0'`) | EcosystemServices, LandAppreciation, Methodology, LandValuation, TerraValueEngine |
| `CANOPY_VALUE_COEFFICIENTS` (line 41) | `config/canopy-value-coefficients.json` | EcosystemServices (line 578), LandAppreciation._canopyValueCurve (line 769) |
| `ECOSYSTEM_SERVICE_RATES` (line 61) | `config/ecosystem-service-rates.json` | EcosystemServices (line 565), frontend index.html (line 883), exposed on TerraValueEngine (line 2335) |
| `SUSTAINABILITY_METRICS` (line 124) | `config/sustainability-metrics.json` | SustainabilityValue (line 828) |
| `CERTIFICATIONS` (line 151) | `config/certifications.json` | CertificationPathway (lines 900, 1074), exposed on TerraValueEngine (line 2334) |
| `LAND_VALUATION_CONSTANTS` (line 1249) | `config/land-valuation-constants.json` | LandValuation (13 references: lines 1376, 1442, 1537-40, 1664-77, 1708, 1813, 1995, 2082, 2120-21, 2215), exposed on TerraValueEngine (line 2336) |

**Computed constant in `config/index.js`:**
- `ECO_SERVICE_TOTAL_PER_ACRE` = 494 + 520 + 418 + 252 + 320 = **2,004** (replaces hardcoded `2004` at engine line 687)

---

## Frontend Integration Points (Must Preserve)

### index.html (3 engine calls)
- **Line 993:** `<script src="terravalue-engine.js"></script>`
- **Line 1042:** `TerraValueEngine.EcosystemServices.calculate({...})` — demo with 3 hardcoded parcels
- **Line 1045:** `TerraValueEngine.LandAppreciation.project({...})` — 30-year projection for demo

### terravalue.html (4 engine calls)
- **Line 814:** `<script src="terravalue-engine.js"></script>`
- **Line 842:** `TerraValueEngine.LandAppreciation.project({...})` — slider-driven projector
- **Line 883:** `TerraValueEngine.ECOSYSTEM_SERVICE_RATES` — reads rates directly for bar chart computation
- **Line 935:** `TerraValueEngine.LandValuation.fullValuation({...})` — button-triggered land valuation tool

---

## Task List (17 Tasks, 5 Phases)

### Phase 1 — Foundation
- [x] **#7** Scaffold project structure and package.json
- [x] **#8** Extract constants into config/ as JSON + create `lib/terravalue-engine.js` *(parity validated against original engine)*

### Phase 2 — Service Handlers (parallelizable after #8)
- [x] **#9** POST /api/ecosystem — EcosystemServices.calculate()
- [x] **#10** POST /api/certifications — CertificationPathway.assess()
- [x] **#11** POST /api/valuation — PropertyValuation.getCompositeValue()
- [x] **#12** POST /api/appreciation — LandAppreciation.project()
- [x] **#13** POST /api/land-valuation — LandValuation.fullValuation()

### Phase 3 — Integration Layer
- [x] **#14** POST /api/analyze — orchestrator, calls all 5 services
- [x] **#15** Unified api/index.js router — routing, CORS, error format
- [x] **#16** Update vercel.json — add `/api/*` rewrite rules
- [x] **#17** Golden parity tests — 26 tests, 7 suites, 0 failures
- [x] **#20** dataQuality flags on all responses *(Audit Finding #6 fix)*
- [x] **#21** API key authentication — X-API-Key header, same-origin bypass, constant-time comparison

### Phase 4 — Frontend Migration
- [x] **#18** index.html → async runDemo() with API fallback to local engine
- [x] **#19** terravalue.html → debounced projector (150ms), async land valuation, ECO_RATES probe

### Phase 5 — Deploy & Cutover
- [ ] **#22** Deploy to Vercel + E2E validation
- [ ] **#23** Remove `<script src="terravalue-engine.js">` tags *(only after 1+ week stable)*

### Dependency Critical Path
```
#7 → #8 → #9 → #14 → #15 → #16 → #18 → #22 → #23
```
Tasks #9, #10, #11, #13 are parallelizable. Tasks #18 & #19 are parallelizable.

---

## Next Step When Resuming

**Create `lib/terravalue-engine.js`** — Copy the original engine, replace all 6 inline `const` blocks with `require('../config')` imports. The file should:

1. `const { METHODOLOGY_VERSION, CANOPY_VALUE_COEFFICIENTS, ECOSYSTEM_SERVICE_RATES, SUSTAINABILITY_METRICS, CERTIFICATIONS, LAND_VALUATION_CONSTANTS, ECO_SERVICE_TOTAL_PER_ACRE } = require('../config');`
2. Keep all 7 classes exactly as-is (PropertyValuation, EcosystemServices, LandAppreciation, SustainabilityValue, CertificationPathway, LandValuation, Methodology)
3. Keep the TerraValueEngine orchestrator class
4. Export via `module.exports` only (remove the `window.TerraValueEngine` browser global)
5. Replace the hardcoded `494 + 520 + 418 + 252 + 320` sum at line 687 with `ECO_SERVICE_TOTAL_PER_ACRE`

**Then validate** by running a quick Node script that `require()`s the lib module, calls `EcosystemServices.calculate()` with a known parcel, and compares output to the original engine.

---

## vercel.json Update Needed

Current:
```json
{
  "buildCommand": null,
  "outputDirectory": "website",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [...]
}
```

Add:
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

Plus API-specific headers (CORS, cache-control) for `/api/*` routes.

---

## Key Audit Findings to Remember

| # | Finding | Status |
|---|---------|--------|
| 5 | Projector hardcodes 15,000 sqft lot size | IDENTIFIED — need lot size input or disclaimer |
| 6 | Land valuation UI ignores `dataQuality.syntheticDataUsed` flag | **HIGH** — API layer will enforce this (Task #20) |
| — | Stormwater $520 lacks specific publication citation | Noted — label as "benefit transfer" |
| — | Habitat $320 is approximate benefit transfer | Noted — already labeled |
| — | 5% ecosystem capitalization rate unsourced | Professional judgment — add note |

---

**To resume:** Share this file + the `P&X/` folder in a new session. Say: "Resume TerraValue API migration from the handoff. Next step is creating lib/terravalue-engine.js."
