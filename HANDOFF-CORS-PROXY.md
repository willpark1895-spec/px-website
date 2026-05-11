# Next Session — CORS Proxy for TerraValue Integrations
**Date opened:** May 9, 2026
**Status:** Ready for a fresh session to execute. All discovery is done.

---

## TL;DR for the next Claude

The standalone TerraValue React app (terravalue.app) imports a beautiful integrations module that calls six US government data sources (Census, NRCS, NLCD, NOAA, PRISM, AirNow) to auto-populate parcel data. **None of those endpoints send CORS headers**, so every browser request fails. Today (May 9) we rolled back the integration calls in `handleGeocode` so the live site renders cleanly with the old Nominatim-only flow. The integration files are still in the repo, untouched, waiting for you.

**Your job:** add proxy routes to the P&X serverless API (`pxconsulting.io/api/proxy/*`) so the browser can call those sources via a server-side hop that adds CORS headers. Then re-enable the integrations call in TerraValue.jsx.

This is exactly the same "single source of truth" pattern P&X already uses for `/api/ecosystem`, `/api/appreciation`, etc. — just extended to wrap third-party data sources instead of the engine.

---

## What's Live Right Now (as of May 9, 2026)

### Standalone TerraValue (terravalue.app)
- Latest commit on `main`: hotfix that reverts `handleGeocode` to Nominatim-only
- The integration modules (`src/parcelData.js`, `src/integrations/*.js`) are imported but unused — they bundle but tree-shake out at runtime
- Value corrections from earlier today **are still live**: $190 SC-CO2, 0.14 GA Power energy, 12% premium cap
- AirNow API key (`VITE_AIRNOW_API_KEY`) is set in Vercel env vars
- Vercel build: green
- Audit doc at `terravalue/AUDIT.md` describes the integrations module in detail

### P&X (pxconsulting.io)
- `/api/*` routes deployed and stable (ecosystem, appreciation, valuation, certifications, land-valuation, analyze, health)
- All 26 golden parity tests passing
- Auth via `X-API-Key` (currently open access; key not set in Vercel)
- Vercel build: green

---

## The CORS Problem in Concrete Terms

When `terravalue.app` (Vercel origin A) tries to `fetch()` `https://sdmdataaccess.nrcs.usda.gov/...` (federal origin B), the browser sends an `Origin: https://www.terravalue.app` header. The federal server responds 200 OK with valid data but doesn't include `Access-Control-Allow-Origin: ...` in the response headers. The browser sees no CORS header, throws the response away, and your JS code only sees an error.

The endpoints that failed today (from production console logs):
- `geocoding.geo.census.gov/geocoder/locations/onelineaddress` — Status 200, no CORS
- `www.mrlc.gov/arcgis/.../USFS_NLCD_TCC_CONUS_All/ImageServer/identify` — Status 404, no CORS
- `www.mrlc.gov/arcgis/.../NLCD_Impervious_Cover_All_Years/ImageServer/identify` — Status 404, no CORS
- `services.nacse.org/prism/data/public/4km/...` — Status 200, no CORS
- `hdsc.nws.noaa.gov/cgi-bin/.../cgi_readH5.py` — Status 301 redirect, no CORS

AirNow at `airnowapi.org` **does** send CORS headers (confirmed by their docs and by the fact that the new env var was set today), so that one could potentially call direct. Worth verifying empirically when you wire things up — if AirNow works direct, skip the proxy for it.

---

## The Fix: Add Proxy Routes to the P&X API

The P&X serverless API at `api/index.js` is a single dispatcher (one Vercel serverless function, internal routing). It already sets `Access-Control-Allow-Origin: *` for `/api/*` per `vercel.json`. Add new routes that fetch the upstream endpoint server-side and pipe the response back.

### Proposed routes

| Browser call | Vercel handler | Upstream URL |
|---|---|---|
| `GET /api/proxy/census/geocode?address=...` | `handleCensusGeocode()` | `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=...&benchmark=Public_AR_Current&format=json` |
| `GET /api/proxy/nrcs/soil?lat=...&lon=...` | `handleNrcsSoil()` | NRCS SDA POST endpoint (current `lookupSoil` payload) |
| `GET /api/proxy/nlcd/canopy?lat=...&lon=...` | `handleNlcdCanopy()` | `https://www.mrlc.gov/arcgis/.../USFS_NLCD_TCC_CONUS_All/ImageServer/identify?...` |
| `GET /api/proxy/nlcd/impervious?lat=...&lon=...` | `handleNlcdImpervious()` | `https://www.mrlc.gov/arcgis/.../NLCD_Impervious_Cover_All_Years/ImageServer/identify?...` |
| `GET /api/proxy/noaa/atlas14?lat=...&lon=...` | `handleNoaaAtlas14()` | `https://hdsc.nws.noaa.gov/cgi-bin/hdsc/new/cgi_readH5.py?...` |
| `GET /api/proxy/prism/normals?lat=...&lon=...` | `handlePrismNormals()` | `https://services.nacse.org/prism/data/public/4km/...` |
| (skip if direct works) `GET /api/proxy/airnow?lat=...&lon=...` | `handleAirnow()` | `https://www.airnowapi.org/aq/observation/latLong/current/?...&API_KEY=...` |

### Why one dispatcher route is enough

The existing P&X API uses one dispatcher (`api/index.js`) with internal routing via a `ROUTES` object. Add a `/api/proxy/*` prefix that matches the same pattern — each new handler is ~15 lines of code (fetch upstream, set headers, return body).

For AirNow specifically, the proxy lets you keep the API key **server-side only** (read from `process.env.AIRNOW_API_KEY` instead of `VITE_AIRNOW_API_KEY`). Better security model.

### Cache aggressively

Federal data doesn't change minute-to-minute. Set `Cache-Control: public, max-age=86400` on proxy responses. Soil polygons, canopy rasters, and precip normals are stable for years. Vercel's CDN will cache server-side, your bandwidth cost stays zero.

### Rate limiting

NRCS and NOAA are public-funded; they'll throttle aggressive callers. The proxy means every browser hits Vercel first; you can add rate limiting if needed (probably not needed at MVP scale). NOAA Atlas 14 specifically has a request-throttling notice in their docs.

---

## Files to Edit

### In `P&X/`
1. **`api/index.js`** — add the 6 (or 7) proxy handlers and register them in the `ROUTES` table. Each handler:
   ```js
   async function handleNrcsSoil(req, query) {
     const { lat, lon } = query;
     if (!lat || !lon) return { status: 400, body: { error: 'lat, lon required' } };
     const upstreamRes = await fetch('https://sdmdataaccess.nrcs.usda.gov/...', { ... });
     const data = await upstreamRes.json();
     return { status: 200, body: data };
   }
   ```
   Add cache headers in the response. Add to `ROUTES`:
   ```js
   '/api/proxy/nrcs/soil': { handler: handleNrcsSoil, method: 'GET' },
   ```

2. **`tests/golden-parity.test.js`** — optional, add a sanity test that hits each proxy route with a known lat/lon and confirms 200.

### In `terravalue/`
3. **`src/integrations/*.js`** — change each `lookup*()` function to call the proxy instead of the upstream URL directly. The function bodies stay mostly the same; just swap the URL. Drop a config constant at the top of `integrations/index.js`:
   ```js
   const PROXY_BASE = import.meta.env.VITE_PROXY_BASE || 'https://pxconsulting.io/api/proxy';
   ```
   That lets you point at a local P&X dev server during testing without changing code.

4. **`src/TerraValue.jsx`** — re-enable the `pullAllData()` call in `handleGeocode()`. The change is small — un-revert the hotfix comment block (lines ~899–971) back to using the integrations. Git history has the previous version: `git show dd71cb9:src/TerraValue.jsx | sed -n '983,1068p'` will show it.

---

## Order of Operations

1. **Build proxy routes on P&X side first**, test each one with curl from your laptop. None of this needs to deploy yet — you can `vercel dev` locally.
2. **Deploy proxy** to `pxconsulting.io`. Verify routes return 200 with proper CORS headers in DevTools (Network tab → Response Headers should show `Access-Control-Allow-Origin: *`).
3. **Update `src/integrations/*.js`** in the TerraValue repo, point at production proxy. Test in DevTools that the calls succeed from a `terravalue.app` origin.
4. **Re-enable `pullAllData()` in `handleGeocode`**, ship the TerraValue commit.
5. **Verify on live site** that auto-populate works for a demo address and that DevTools console is clean.

Two separate Vercel projects, two pushes, two Vercel deploys. Both are auto-deploy from `main`.

---

## Risks / Gotchas

- **NLCD's ArcGIS endpoint was returning 404 today** (`Status code: 404`). That suggests the endpoint URL itself is wrong, not just a CORS issue. Verify with `curl` before assuming the proxy will fix it. The next session may need to find the correct MRLC endpoint — they reorganize occasionally.
- **NOAA Atlas 14** returned a 301 redirect to a different path (`/cgi-bin/new/cgi_readH5.py` redirected to `/cgi-bin/hdsc/new/cgi_readH5.py`). The integrations module already uses the post-redirect URL; this should just work via the proxy because the proxy is server-side and can follow redirects.
- **AirNow CORS** — needs verification. If it works direct from the browser, keep it direct (one less hop, but exposes the API key). If you proxy it, move the key to server-side env vars.
- **Bundle size** — the integrations module is bundled even though it's not called today. ~5–10 KB hit. Acceptable, but once you wire the proxy, the unused-import problem goes away because they'll be used.
- **Don't strip the dead code in TerraValue.jsx yet** — `STANDARD_FIELD_MAP`, `CITY_GIS`, `COUNTY_GIS`, `detectCity`, `detectCounty`, `findFieldValue` are orphaned (~120 lines). Tempting to delete. Don't — leave them until after the proxy work lands, then delete in a single tidy-up commit so the diff is clean.

---

## Quick Reference: Two Repos, Two Vercel Projects

| Folder | Repo | Vercel Project | URL |
|---|---|---|---|
| `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/` | `willpark1895-spec/terravalue` | terravalue | https://www.terravalue.app |
| `~/Desktop/Desktop - a laptop/Claude-Work/P&X/` | `willpark1895-spec/px-website` | px-website | https://pxconsulting.io |

See `P&X/VERCEL-PROJECTS.md` for full deployment map.

---

## How to Start the Next Session

In a new Cowork chat, paste this:

> Resume TerraValue work. Open `P&X/HANDOFF-CORS-PROXY.md` and follow the plan there. Build proxy routes on the P&X side, then re-enable the integrations in TerraValue.jsx. I want you to:
> 1. Read the handoff doc end to end
> 2. Verify with curl that each upstream endpoint actually returns data (the NLCD 404 worry from today is real — confirm the URL is right before building the proxy)
> 3. Propose the proxy implementation in chat before writing any code
> 4. Then ship in small, reviewable commits

---

## What This Session Accomplished

- Identified that the May 4 P&X audit fixes hadn't propagated to the standalone TerraValue React app
- Inventoried drift: $255 vs $190 SC-CO2, 0.12 vs 0.14 energy rate, no 12% premium cap, no dataQuality block
- Shipped value corrections inline ($190 SC-CO2, 0.14 GA Power, 12% empirical ceiling, 5 methodology citations updated, Netusil 2014 + Cho 2020 added)
- Discovered an earlier Cowork session had built a hardened parcel-data module + 6 federal-data integrations sitting untracked in the repo
- Audited the refactor, confirmed it was well-built, shipped it
- Build failed (duplicate `queryParcelData`), hotfixed by removing the orphaned inline function
- Build succeeded; production showed CORS failures from every federal endpoint
- Rolled back the integrations call to Nominatim-only, kept the modules in place for the next session
- Set up `VITE_AIRNOW_API_KEY` in Vercel
- Wrote this handoff

**Net commits shipped today** (TerraValue repo):
1. `dd71cb9` — Audit fixes + parcel data refactor + multi-source integrations
2. `0ed6005` — Hotfix: remove orphaned inline queryParcelData
3. `a43efea` — Trigger redeploy: pick up VITE_AIRNOW_API_KEY env var
4. (about-to-push) — Hotfix: bypass integrations in handleGeocode (CORS blocked)
