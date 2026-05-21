# STATUS: Archived 2026-05-20.
# These are the paste-into-terminal commands for the May 4 two-commit push
# (API migration + phantom-data audit fixes). That push shipped. Future
# pushes generate fresh commands inline in the session. Kept for reference only.


---

#!/bin/bash
# TerraValue API migration + audit fixes — two-commit push
# Generated 2026-05-04
#
# Run blocks one at a time so you can read each output.
# Sandbox can't write to .git, so the push happens from your laptop.
#
# Why two commits?
#   • Commit 1 = the API migration (large, well-tested, sitting since Apr 30)
#   • Commit 2 = the phantom-data fixes (smaller, layered on top)
#   Two commits = two Vercel previews = you can verify behavior at each step
#   and roll back the fixes alone if needed.

# ────────────────────────────────────────────────────────────
# 0. Move into the repo and confirm the starting state
# ────────────────────────────────────────────────────────────
cd ~/Desktop/Claude-Work/"P&X"
git status
git log --oneline -3

# ────────────────────────────────────────────────────────────
# COMMIT 1 — API migration (the big one)
# ────────────────────────────────────────────────────────────
# Stage: new directories + modified frontend + handoff docs
git add api/ lib/ config/ tests/ package.json vercel.json
git add website/index.html website/terravalue.html
git add CUTOVER-CHECKLIST.md \
        TerraValue-API-Migration-Handoff.md \
        TerraValue-API-Session-Summary.docx \
        TerraValue-Audit-Report.md \
        TerraValue-Feature-Prioritization.md \
        TerraValue-Positioning-Brief.md

# Sanity-check what's staged
git status

# Commit
git commit -m "TerraValue API migration: serverless decomposition + frontend cutover

- Decomposed 2,345-line engine into 5 services + shared config
- New: api/index.js router (7 routes, X-API-Key auth, CORS, dataQuality flags)
- New: lib/terravalue-engine.js (Node-first, imports from config/*.json)
- New: config/ — externalized constants (5 JSON files + index loader)
- New: tests/golden-parity.test.js (26 tests, 7 suites — all pass)
- New: tests/e2e-validate.js (post-deploy validation)
- Frontend: index.html and terravalue.html now API-first with local fallback
- vercel.json: /api/(.*) rewrite + per-route CORS/cache headers"

# Push commit 1 — wait for Vercel to build a preview before continuing
git push origin main

# Optional: validate the Vercel preview now
# node tests/e2e-validate.js https://YOUR-PROJECT.vercel.app

# ────────────────────────────────────────────────────────────
# COMMIT 2 — Phantom-data audit fixes
# ────────────────────────────────────────────────────────────
# These are the disclosure fixes from AUDIT-2026-05-04.md.
# They touch:
#   • api/index.js              (Phantoms #1, #2, #3 — buildDataQuality helper)
#   • lib/terravalue-engine.js  (Phantom #3 — engine.analyze flags assumptions)
#   • website/terravalue.html   (Phantoms #4, #5 — projector caption + LV form guards)
git add api/index.js lib/terravalue-engine.js website/terravalue.html
git add AUDIT-2026-05-04.md PUSH-COMMANDS.sh

git status

git commit -m "Audit fixes: derive confidence from inputs, disclose synthesized values

Per AUDIT-2026-05-04.md (5 phantom-data findings):

1. /api/ecosystem: confidence now derived from canopySource ('measured' = high,
   missing/'estimated' = moderate). Was hardcoded 'high'.

2. /api/appreciation: optional defaults (currentCanopyPct, lotSizeSqFt,
   baseAppreciationRate) now tracked in dataQuality.assumptionsApplied[];
   syntheticDataUsed flips true and confidence drops accordingly.

3. engine.analyze(): orchestrator-synthesized inputs (canopy-derived score,
   GI proxy, biodiversity proxy) now exposed in dataQuality.assumptionsApplied[].
   /api/analyze and /api/land-valuation merge engine + API assumptions into one block.

4. Projector caption discloses the 15K sqft + canopy-from-score assumption.

5. Land Valuation form: added Condition + Location Quality selects (were silently
   defaulting to 3). Added 'Demo values shown' banner that hides on first edit.
   Added missing lv-dq element. Tracks per-field demo state, surfaces untouched
   fields in the result warning.

All 26 golden-parity tests still pass. No calculation logic changed —
only disclosure behavior."

git push origin main

# ────────────────────────────────────────────────────────────
# After Vercel auto-deploys commit 2, run the E2E validator
# ────────────────────────────────────────────────────────────
# node tests/e2e-validate.js https://YOUR-PROJECT.vercel.app
