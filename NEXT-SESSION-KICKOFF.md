# Next Session — Kickoff Primer

**Last updated:** 2026-05-20

**Paste this whole file into the first message of a new Cowork chat. It's enough context for Claude to be useful immediately.**

---

I'm William Park (P&X — Phloem & Xylem, the natural-resource consulting practice). Resuming TerraValue + P&X work.

**Read these files first, in order:**
1. `Desktop/Desktop - a laptop/Claude-Work/P&X/README.md` — source-of-truth index. Lists every canonical doc and the current state of the project. Start here.
2. `Desktop/Desktop - a laptop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-10.md` — most recent handoff. The Reading 3 cutover is **done**: terravalue.app serves the AVM-voice standalone page from `px-website/terravalue-standalone/`.
3. `Desktop/Desktop - a laptop/Claude-Work/P&X/VERCEL-PROJECTS.md` — deployment map.
4. `Desktop/Desktop - a laptop/Claude-Work/Outputs/William Park - Session Summary.md` — the master through-line if you want full historical context.

Earlier handoffs and obsolete planning docs live in `P&X/archive/` (each with a status banner explaining why it was archived). Don't rely on archived docs for current state.

**Quick state summary** (so you don't have to dig):
- **Two domains, two Vercel projects, one repo.** Both `pxconsulting.io` and `www.terravalue.app` are deployed from the same `willpark1895-spec/px-website` repo, different Root Directories (`website/` and `terravalue-standalone/` respectively).
- **The standalone AVM-voice page is live.** Hero, "Inside the Engine", "Integration Surface", "Sensitivity Analysis", "Under the Hood", validation study band, founder section reframed around P&X, `© 2026 P&X (William Park)`.
- **The P&X API at `pxconsulting.io/api/*` serves terravalue.app cross-origin** via the existing `Access-Control-Allow-Origin: *` header. All three calculator endpoints (`/ecosystem`, `/appreciation`, `/land-valuation`) work cross-origin. 26/26 golden parity tests still pass.
- **The React app at `willpark1895-spec/terravalue` is orphaned but preserved.** Leaflet map, PDF export, parcel-data refactor, federal-data integration modules — all still in Git, not deploying anywhere. Available to port if needed.

**Pending tasks (priority order):**
1. **Set `TERRAVALUE_API_KEY` env var on Vercel** to gate the API (currently open access). If set, the standalone HTML calculator will need the header added to its `fetch` calls or the terravalue.app origin whitelisted in API auth.
2. **Three audit sourcing items still open** — stormwater $520/canopy-acre citation, the 5% ecosystem cap rate, habitat $320 (already labeled benefit transfer).

**Recently resolved (2026-05-20):**
- **Duplication cleanup.** `website/terravalue.html` was deleted; `pxconsulting.io/terravalue` and `/terravalue.html` now 301-redirect to https://www.terravalue.app via root `vercel.json`. Sitemap updated. `terravalue-standalone/` is the canonical TerraValue surface.
- **Script-tag cutover closed.** `website/index.html` was already cutover (no `terravalue-engine.js` reference). `website/terravalue-engine.js` deleted. `terravalue-standalone/terravalue-engine.js` intentionally retained as the live client-side fallback for terravalue.app. See `CUTOVER-CHECKLIST.md` (now closed).
- **Documentation cleanup.** Root flattened from 19 files to 9 canonical docs. Historical docs moved to `P&X/archive/{handoffs,audits}/` with status banners. New `README.md` is the source-of-truth index. `VERCEL-PROJECTS.md` rewritten for the post-Reading-3 reality (single repo, two Root Directories).

**Working rules:**
- Ask before starting big work.
- Ask where to save files.
- Path note: my Desktop folder is nested inside `Desktop - a laptop/` because of iCloud sync. The right path is always `~/Desktop/Desktop - a laptop/Claude-Work/...`. Use double quotes around `Desktop - a laptop` in bash.
- I'm pushing from my laptop. Don't try to push from the sandbox; generate paste-into-terminal commands.
- Ask permission before sharing my name or current employer in public-facing content.
- Be an extension of the Soil Principle — work the foundations, not the appearances.

**My ask for this session:** [fill in — e.g., "Set up the TERRAVALUE_API_KEY gating end-to-end" or "Audit the three open sourcing items" or something specific you want to focus on]
