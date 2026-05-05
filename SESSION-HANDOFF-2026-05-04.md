# P&X / TerraValue — Session Handoff
**Date:** May 4, 2026
**Session focus:** Resume API migration push + audit + phantom-data fixes
**Repo:** github.com/willpark1895-spec/px-website
**Live:** Vercel auto-deploy on `main` (URL set in Vercel dashboard)

---

## TL;DR

- The TerraValue engine migration is **fully shipped**. All work from the April 30 cutover checklist is on `main`.
- Three commits landed this session: API migration (66225b5), audit docs (235e7a5), .DS_Store ignore (0ba5fc7).
- All 5 phantom-data findings from the audit were **fixed inline** during the migration commit. Math is unchanged; disclosure is now honest.
- 26/26 golden parity tests pass. Working tree clean. Vercel deploys are healthy (verified by manually testing the homepage demo widget and the Land Valuation tool on the live URL).
- Two operational items remain: (1) run `tests/e2e-validate.js` against the live URL after the next deploy stabilizes, (2) execute the script-tag cutover after 1+ week of stable API logs (`CUTOVER-CHECKLIST.md`).

---

## What Shipped This Session

### Commits on `main`

| Hash | Subject | Files |
|---|---|---|
| `0ba5fc7` | Ignore macOS .DS_Store files | `.gitignore` |
| `235e7a5` | Docs: audit report (5 phantom-data findings, all fixed in 66225b5) | `AUDIT-2026-05-04.md`, `PUSH-COMMANDS.sh` |
| `66225b5` | TerraValue API migration: serverless decomposition + frontend cutover | 20 files, +4,335 / −126 |

### What's Now in the Repo

```
P&X/
├── api/
│   └── index.js                    (496 lines — 7 routes, auth, dataQuality)
├── lib/
│   └── terravalue-engine.js        (1,771 lines — Node-side engine, no inline constants)
├── config/
│   ├── index.js                    (loader + computed ECO_SERVICE_TOTAL_PER_ACRE)
│   ├── canopy-value-coefficients.json
│   ├── ecosystem-service-rates.json
│   ├── sustainability-metrics.json
│   ├── certifications.json
│   └── land-valuation-constants.json
├── tests/
│   ├── golden-parity.test.js       (26 tests, 7 suites — all pass)
│   └── e2e-validate.js             (post-deploy validation)
├── website/
│   ├── index.html                  (homepage, API-first w/ local fallback)
│   ├── terravalue.html             (TerraValue page, API-first w/ local fallback)
│   ├── terravalue-engine.js        (ORIGINAL — kept as fallback, removed at cutover)
│   └── sitemap.xml
├── package.json                    (zero deps, Node ≥18)
├── vercel.json                     (rewrite + CORS headers)
├── .gitignore                      (NEW — .DS_Store)
├── CUTOVER-CHECKLIST.md            (the next operational task)
├── AUDIT-2026-05-04.md             (5 findings; all fixed)
├── PUSH-COMMANDS.sh                (the two-commit script we just used)
├── PX-Session-Handoff.md           (April 27–28, prior session)
├── TerraValue-Audit-Report.md      (April 28, prior code audit)
├── TerraValue-API-Migration-Handoff.md  (April 29, mid-migration handoff)
├── TerraValue-API-Session-Summary.docx  (May 4 client-facing summary)
├── TerraValue-Feature-Prioritization.md
├── TerraValue-Positioning-Brief.md
├── PX-Partner-Overview.pdf
└── PX-Business-Plan.pdf
```

---

## The 5 Phantom Fixes (now live)

All five are disclosure changes. The math is unchanged. What changed is which fields the API admits to having synthesized.

### #1 — `/api/ecosystem` confidence
**Before:** hardcoded `confidence: 'high'`.
**After:** new `buildDataQuality()` helper. Confidence derived from `canopySource` field on the request:
- `canopySource: 'measured'` → `confidence: 'high'`
- missing or `'estimated'` → `confidence: 'moderate'`

### #2 — `/api/appreciation` silent defaults
**Before:** `currentCanopyPct`, `lotSizeSqFt`, `baseAppreciationRate` defaulted to 25/15000/0.035 silently.
**After:** each defaulted field is appended to `dataQuality.assumptionsApplied[]` with its source-of-default label. `syntheticDataUsed` flips to true. Confidence drops to `low` when 2+ defaults fire.

### #3 — `engine.analyze()` synthesized inputs
**Before:** `hasGreenInfrastructure: parcelData.canopyPct > 25`, `biodiversityNetGainPct: ... > 30 ? 12 : 5`, and `projectedScore = currentScore + 10` were synthesized inside the orchestrator with no disclosure.
**After:** `engine.analyze()` now returns its own top-level `dataQuality` block with `assumptionsApplied[]`. `/api/analyze` and `/api/land-valuation` merge engine + API-layer assumptions via `buildDataQuality()`.

### #4 — Projector lot-size assumption
**Before:** projector silently used `lotSizeSqFt: 15000` and `currentCanopyPct: curr * 0.4`.
**After:** subtle stone-tone caption under the projector header: *"Illustrative model. Projection assumes a 15,000 sqft typical lot and derives canopy from the score slider (canopy % ≈ score × 0.4). For parcel-specific results, use the Land Valuation tool below with your actual lot size."*

### #5 — Land Valuation form
**Before:** `condition` and `locationQuality` were hardcoded to 3 in the click handler (not exposed as inputs). Empty fields silently fell back to demo values. The `lv-dq` element was referenced in JS but didn't exist in the HTML.
**After:**
- Added Condition + Location Quality `<select>` controls (1–5 scale, default 3).
- Added "Demo values shown" gold-tinted banner that hides on first user edit.
- Added `data-demo="true"` attribute to every prefilled field; cleared on input/change.
- Added missing `lv-dq` element to the results area.
- `lvBtn` handler tracks untouched fields and surfaces them in `lv-dq` alongside engine warnings (synthetic comps, estimated income).
- Sends `canopySource: 'measured' | 'estimated'` to the API based on whether the user touched the canopy field.

### `buildDataQuality()` contract (api/index.js)

```js
{
  confidence: 'high' | 'moderate' | 'low',  // derived from inputs, not declared
  syntheticDataUsed: boolean,                // true if any default fired
  assumptionsApplied: string[],              // each defaulted field with its source
  canopySource: 'measured' | 'estimated' | null,
  note: string                               // human-readable summary
}
```

Confidence rules:
- `low` when ≥2 assumptions applied
- `moderate` when 1 assumption OR canopy missing/estimated
- `high` only when all required inputs supplied AND `canopySource: 'measured'`

---

## What's Pending

### Operational (no code changes needed)
1. **Validate live deploy.** From the project root on your laptop:
   ```bash
   cd ~/Desktop/Claude-Work/"P&X"
   node tests/e2e-validate.js https://YOUR-VERCEL-URL.vercel.app
   ```
   Should print 23 passing checks. Run after Vercel finishes deploying `0ba5fc7`.

2. **Script-tag cutover** (after 1+ week of stable API logs). Per `CUTOVER-CHECKLIST.md`:
   - Remove `<script src="terravalue-engine.js"></script>` from `website/index.html` (line 993) and `website/terravalue.html` (line 814).
   - Remove the `runDemoLocal()` function and all `typeof TerraValueEngine !== 'undefined'` fallback branches.
   - Replace fallback code with user-facing error messages.
   - Optionally archive/delete `website/terravalue-engine.js` (~155 KB).

### Pre-launch polish (recommended before public marketing push)
3. **Set `TERRAVALUE_API_KEY` on Vercel.** `vercel env add TERRAVALUE_API_KEY` then redeploy. Without it, the API is open access (fine for now; gates external scraping later).
4. **Domain `pxconsulting.io` DNS** → point at Vercel.
5. **Replace mailto with Formspree.** Both index.html forms currently use `mailto:hello@pxconsulting.io` — switch to a real form endpoint when ready.

### Audit items still open (non-blocking)
6. Stormwater $520/canopy-acre lacks a specific publication citation (labeled "benefit transfer" in config).
7. 5% ecosystem capitalization rate in LandValuation is professional judgment — sourcing TBD.
8. Habitat $320 is approximate benefit transfer (already labeled).

---

## Verified This Session

| Check | Result |
|---|---|
| `node --test tests/golden-parity.test.js` | 26/26 pass, 7 suites, ~95 ms |
| Manual probe: 4 confidence resolution cases (high/moderate/low) | Correct |
| Manual probe: `engine.analyze()` returns 5 synthesized assumptions | Correct |
| Constants drift between `lib/`, `config/`, and `website/terravalue-engine.js` | None — all match |
| `lib/terravalue-engine.js` browser leaks (`window.*`, `document.*`, `fetch()`) | None |
| `ECO_SERVICE_TOTAL_PER_ACRE` = 494 + 520 + 418 + 252 + 320 | = 2,004 ✓ |
| Live deploy: homepage demo widget renders numbers from API | ✓ |
| Live deploy: Land Valuation tool runs end-to-end | ✓ |

---

## Architecture Snapshot

**API contract.** All POST endpoints return `{ ...engineOutput, dataQuality, route }`. The seven routes:

| Route | Method | Engine Call | Required Body |
|---|---|---|---|
| `/api/ecosystem` | POST | `EcosystemServices.calculate()` | `lotSizeSqFt`, `canopyPct`, `assessedValue` |
| `/api/certifications` | POST | `CertificationPathway.assess()` | none (defaults to all 4 standards) |
| `/api/valuation` | POST | `PropertyValuation.getCompositeValue()` | `assessedValue` |
| `/api/appreciation` | POST | `LandAppreciation.project()` | `currentScore`, `projectedScore`, `timelineYears`, `propertyValue` |
| `/api/land-valuation` | POST | `LandValuation.fullValuation()` | `lotSizeSqFt`, `assessedValue` |
| `/api/analyze` | POST | `engine.analyze()` (orchestrator) | `lotSizeSqFt`, `canopyPct`, `assessedValue` |
| `/api/health` | GET | n/a — public, always 200 | n/a |

**Auth.** `TERRAVALUE_API_KEY` env var. When unset → open access. When set → same-origin and localhost requests pass through; external requests need `X-API-Key` header. `/api/health` always public. Constant-time comparison.

**Frontend pattern.** Every API call is wrapped: `try { fetch('/api/...') } catch { fallback to TerraValueEngine.* }`. The fallback path will be deleted at cutover.

---

## How to Resume

**Drop these into the new Cowork session:**
1. `SESSION-HANDOFF-2026-05-04.md` (this file)
2. `NEXT-SESSION-KICKOFF.md` (one-page primer — paste the contents into chat)
3. The `P&X/` folder (read-only inspection)

**First message to send to the new session:**
> "Resume P&X / TerraValue work. Read SESSION-HANDOFF-2026-05-04.md first, then ask me what I want to focus on."

**Likely next sessions** (in roughly this order):
- A. Run e2e-validate against the live URL and confirm green
- B. Decide on first marketing/positioning push (see `TerraValue-Positioning-Brief.md`)
- C. Wire `TERRAVALUE_API_KEY` and DNS for `pxconsulting.io`
- D. Build the next feature from `TerraValue-Feature-Prioritization.md`
- E. After 1+ week stable, run script-tag cutover

---

## Working Rules (carried forward)

- Ask before starting big work.
- Ask where to save files.
- Ask permission before sharing William's name or current employer in public-facing content.
- Be an extension of the Soil Principle: work the foundational systems, not the visible appearances.
