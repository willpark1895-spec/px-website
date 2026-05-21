# TerraValue — Standalone deploy (canonical)

**Last updated:** 2026-05-20

This folder is the **canonical TerraValue surface**. It deploys to https://www.terravalue.app via the `px-website` Vercel project (Root Directory = `terravalue-standalone`).

## What's in here

- `index.html` — The TerraValue marketing surface (AVM-voice page: hero, Inside the Engine, Integration Surface, Sensitivity Analysis, Under the Hood, validation band, founder section, P&X footer). Calls the P&X API at `https://pxconsulting.io/api/*` cross-origin via `Access-Control-Allow-Origin: *`.
- `terravalue-engine.js` — Calculation engine, vendored locally for client-side fallback. Identical to the engine bundled by the (now retired) duplicate at `../website/terravalue.html` once was.
- `methodology-audit.md` — Methodology audit, served from this folder so the "Read the methodology audit" link works under the standalone deploy.
- `vercel.json` — Security headers matching the main site.

## State as of May 20, 2026

- **Reading 3 cutover (May 10, 2026):** terravalue.app's Vercel project was repointed from `willpark1895-spec/terravalue` (the React app) to this folder in the `px-website` repo. The React app is preserved in Git but no longer deploys.
- **Duplicate resolution (May 20, 2026):** the previous duplicate at `../website/terravalue.html` was deleted. `pxconsulting.io/terravalue` and `pxconsulting.io/terravalue.html` now 301-redirect to `https://www.terravalue.app` via root `vercel.json`.

## Cross-folder relationship

There is no longer a sync requirement between this folder and `../website/`. The only remaining shared dependency is the API at `pxconsulting.io/api/*`, which is consumed cross-origin.

The previously duplicated `terravalue-engine.js` at `../website/terravalue-engine.js` was deleted on 2026-05-20 (the script-tag cutover is closed — see `../CUTOVER-CHECKLIST.md`). This folder's copy of `terravalue-engine.js` is the only one that remains, and it is intentionally retained as the client-side fallback for `terravalue.app`.

## Still open

- Set `TERRAVALUE_API_KEY` on the `px-website` Vercel project to gate the API. If set, the calculator's `fetch` calls in `index.html` will need an `X-API-Key` header (or whitelist the terravalue.app origin in API auth).
- Three sourcing items from the May 4 audit (stormwater $520/canopy-acre, 5% ecosystem cap rate, habitat $320).
