# Next Session — Kickoff Primer

**Paste this whole file into the first message of a new Cowork chat. It's enough context for Claude to be useful immediately.**

---

I'm William Park (P&X — Phloem & Xylem, the natural-resource consulting practice). Resuming TerraValue + P&X work.

**Read these files first, in order:**
1. `Desktop/Desktop - a laptop/Claude-Work/P&X/HANDOFF-CORS-PROXY.md` — the active work item: build a CORS proxy in the P&X API so the TerraValue React app can call US federal data sources (NRCS, NLCD, NOAA, Census, AirNow) from the browser. **This is the primary task for the next session.**
2. `Desktop/Desktop - a laptop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-09.md` — full state of both projects as of May 9 (today's work, commits, what's pending)
3. `Desktop/Desktop - a laptop/Claude-Work/P&X/VERCEL-PROJECTS.md` — deployment map: which folder maps to which GitHub repo to which Vercel project to which URL
4. `Desktop/Desktop - a laptop/Claude-Work/terravalue/AUDIT.md` — describes the integrations module that needs the proxy

**Quick state summary** (so you don't have to dig):
- Two repos: `px-website` (deploys to pxconsulting.io) and `terravalue` (deploys to terravalue.app). Both auto-deploy from `main`.
- P&X engine migrated to serverless API at `pxconsulting.io/api/*`. Stable. 26 golden parity tests pass.
- TerraValue React app has the same value corrections shipped May 9 ($190 SC-CO2, 0.14 energy, 12% premium cap).
- An earlier Cowork session built `parcelData.js` + `src/integrations/*.js` (NRCS, NOAA, NLCD, EnviroAtlas, AirNow, geocoder) but every call fails in production due to CORS. The modules are in the repo but bypassed in `handleGeocode`.
- AirNow API key is already set in Vercel as `VITE_AIRNOW_API_KEY`.

**Your task** (per `HANDOFF-CORS-PROXY.md`):
1. Verify with curl that each upstream federal endpoint actually returns data (the NLCD endpoint returned 404 today — confirm the URL is right before building the proxy around it)
2. Propose the proxy implementation in chat before writing code
3. Build 6 proxy routes in `P&X/api/index.js` (`/api/proxy/census/...`, `/api/proxy/nrcs/...`, etc.)
4. Update `terravalue/src/integrations/*.js` to call the proxy instead of upstream
5. Re-enable `pullAllData()` in `terravalue/src/TerraValue.jsx` `handleGeocode`
6. Ship in small, reviewable commits — one for the proxy, one for the TerraValue rewire

**Working rules:**
- Ask before starting big work.
- Ask where to save files.
- Path note: my Desktop folder is nested inside `Desktop - a laptop/` because of iCloud sync. The right path is always `~/Desktop/Desktop - a laptop/Claude-Work/...`. Use double quotes around `Desktop - a laptop` in bash.
- I'm pushing from my laptop. Don't try to push from the sandbox; generate paste-into-terminal commands.
- Ask permission before sharing my name or current employer in public-facing content.
- Be an extension of the Soil Principle — work the foundations, not the appearances.

**My ask for this session:** [fill in — e.g., "Start by verifying which federal endpoints actually return data via curl, then propose the proxy" or "Build the proxy end-to-end" or "Something specific you want to focus on"]
