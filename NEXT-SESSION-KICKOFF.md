# Next Session — Kickoff Primer

**Paste this whole file into the first message of a new Cowork chat. It's enough context for Claude to be useful immediately.**

---

I'm William Park (P&X — Phloem & Xylem, the natural-resource consulting practice). Resuming TerraValue + P&X work.

**Read these files first, in order:**
1. `Desktop/Desktop - a laptop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-10.md` — most recent handoff. The Reading 3 cutover is **done**: terravalue.app now serves the AVM-voice standalone page from `px-website/terravalue-standalone/`. The React app at `willpark1895-spec/terravalue` is orphaned from Vercel but preserved in Git.
2. `Desktop/Desktop - a laptop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-09.md` — previous handoff (CORS proxy planning, value corrections, parcel-data refactor adoption). **Note:** the CORS proxy task in `HANDOFF-CORS-PROXY.md` is now obsolete because terravalue.app no longer serves the React app.
3. `Desktop/Desktop - a laptop/Claude-Work/P&X/VERCEL-PROJECTS.md` — deployment map (may need updating; the terravalue.app project now deploys from `px-website` not `terravalue`).
4. `Desktop/Desktop - a laptop/Claude-Work/Outputs/William Park - Session Summary.md` — the master through-line if you want full historical context.

**Quick state summary** (so you don't have to dig):
- **Two domains, two Vercel projects, one repo.** Both `pxconsulting.io` and `www.terravalue.app` are deployed from the same `willpark1895-spec/px-website` repo, different Root Directories (`website/` and `terravalue-standalone/` respectively).
- **The standalone AVM-voice page is live.** Hero, "Inside the Engine", "Integration Surface", "Sensitivity Analysis", "Under the Hood", validation study band, founder section reframed around P&X, `© 2026 P&X (William Park)`.
- **The P&X API at `pxconsulting.io/api/*` serves terravalue.app cross-origin** via the existing `Access-Control-Allow-Origin: *` header. All three calculator endpoints (`/ecosystem`, `/appreciation`, `/land-valuation`) work cross-origin. 26/26 golden parity tests still pass.
- **The React app at `willpark1895-spec/terravalue` is orphaned but preserved.** Leaflet map, PDF export, parcel-data refactor, federal-data integration modules — all still in Git, not deploying anywhere. Available to port if needed.

**Pending tasks (priority order):**
1. **Script-tag cutover on pxconsulting.io** per `CUTOVER-CHECKLIST.md`. The 1-week stability window since the May 4 API migration closed May 11. Once prompted, the task is: remove `<script src="terravalue-engine.js">` from `P&X/website/index.html` and `P&X/website/terravalue.html`, then delete the 2,345-line monolith. **Hold until separately prompted.**
2. **Resolve the duplication between `P&X/website/terravalue.html` and `P&X/terravalue-standalone/index.html`.** Canonical home is now `terravalue-standalone/`. The other should be deleted or collapsed to a redirect.
3. **Set `TERRAVALUE_API_KEY` env var on Vercel** to gate the API (currently open access). If set, standalone HTML calculator will need the header added to its `fetch` calls.
4. **Three audit sourcing items still open** — stormwater $520/canopy-acre citation, the 5% ecosystem cap rate, habitat $320 (already labeled benefit transfer).

**Working rules:**
- Ask before starting big work.
- Ask where to save files.
- Path note: my Desktop folder is nested inside `Desktop - a laptop/` because of iCloud sync. The right path is always `~/Desktop/Desktop - a laptop/Claude-Work/...`. Use double quotes around `Desktop - a laptop` in bash.
- I'm pushing from my laptop. Don't try to push from the sandbox; generate paste-into-terminal commands.
- Ask permission before sharing my name or current employer in public-facing content.
- Be an extension of the Soil Principle — work the foundations, not the appearances.

**My ask for this session:** [fill in — e.g., "Execute the script-tag cutover per CUTOVER-CHECKLIST.md" or "Resolve the terravalue.html / terravalue-standalone duplication" or something specific you want to focus on]
