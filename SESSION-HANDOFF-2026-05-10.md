---
title: P&X + TerraValue — Session Handoff
date: 2026-05-10
supersedes: SESSION-HANDOFF-2026-05-09.md
---

# Session Handoff — May 10, 2026

**Session theme:** Reading 3 cutover. `www.terravalue.app` now serves the AVM-voice standalone page from the `px-website` repo. The React app is orphaned from Vercel (preserved in Git).

**Two commits shipped on `px-website/main`:**
- `71f67f6` — Reading 3 prep: standalone deploy ready (API_BASE absolute, methodology-audit link local, nav brand to root, vercel.json with security headers)
- `b157f34` — Empty commit to flush Vercel's stale repo snapshot after the Git source swap

---

## TL;DR

- **terravalue.app cutover complete.** The Vercel project `prj_51iBTqaXN1v6SU6oJisXD2IB5rlV` was disconnected from `willpark1895-spec/terravalue` (React app) and reconnected to `willpark1895-spec/px-website` with Root Directory = `terravalue-standalone`, Framework = Other. Domain attachment (`www.terravalue.app` + apex) stayed on the same project ID through the swap — no DNS work needed.
- **The AVM-voice page is live.** Hero, "Inside the Engine", "Integration Surface" (with JSON request/response code blocks), "Sensitivity Analysis", "Under the Hood" 4-card data infrastructure grid, validation study band, founder section reframed around P&X, footer `© 2026 P&X (William Park)`.
- **`pxconsulting.io` unchanged.** Still serves `P&X/website/` from the same repo. The P&X API endpoints at `pxconsulting.io/api/*` are unaffected and now serve cross-origin to terravalue.app via the existing `Access-Control-Allow-Origin: *` header.
- **React app at `willpark1895-spec/terravalue` is orphaned from Vercel** but preserved in Git. All the Leaflet/PDF/parcel-data/federal-integrations work is still there if we want to port it later.

---

## What got why it got hard

Three Vercel-side gotchas surfaced during the cutover, worth recording so we don't repeat them.

**Gotcha 1 — Framework Preset stayed on Vite.** When the Vercel project was repointed from the React repo to `terravalue-standalone/`, Framework Preset wasn't auto-reset. It stayed on "Vite", which means Vercel was still trying to `npm install` + `npm run build` against a folder with no `package.json`. Vercel surfaced this as a *misleading* error: "Root Directory 'terravalue-standalone' does not exist." The folder existed; the framework was wrong. Fix: change preset to "Other", turn off all Build/Output/Install overrides.

**Gotcha 2 — Vercel cached a stale repo snapshot.** After the Git source swap, Vercel kept reading the old repo's (React app's) file tree, where `terravalue-standalone/` genuinely doesn't exist. Same "Root Directory does not exist" error, different root cause. Fix: push an empty commit (`git commit --allow-empty`) to force a fresh clone. The empty commit `b157f34` resolved this and the next deploy succeeded.

**Gotcha 3 — None of the standard checks caught either of the above.** Local `main` matched `origin/main` exactly. GitHub's raw file server returned 200 for `terravalue-standalone/index.html`. The Vercel project showed the correct repo slug in Settings → Git. Every diagnostic said "the folder is there, the project is connected, everything should work." The errors were entirely in Vercel's internal state — both the framework-preset leftover and the stale clone. Lesson: when Vercel says "does not exist" but external checks all return the file, suspect Vercel's cached state, not the repo.

---

## State of each project after today

### terravalue.app
- **Vercel project:** `prj_51iBTqaXN1v6SU6oJisXD2IB5rlV` (formerly the React app's project, now repointed)
- **Repo:** `willpark1895-spec/px-website`
- **Production branch:** `main`
- **Root Directory:** `terravalue-standalone`
- **Framework:** Other
- **Build command, install command, output directory:** all empty / overrides off
- **Domains:** `www.terravalue.app` + apex `terravalue.app`
- **Live build:** `b157f34` deployed green
- **API calls:** all three calculator endpoints (`/ecosystem`, `/appreciation`, `/land-valuation`) hit `https://pxconsulting.io/api/*` cross-origin. Verified clean in DevTools.

### pxconsulting.io
- **Vercel project:** unchanged (separate project, separate connection)
- **Repo:** `willpark1895-spec/px-website` (same repo, different Root Directory: `website`)
- **API routes:** `/api/ecosystem`, `/api/appreciation`, `/api/valuation`, `/api/certifications`, `/api/land-valuation`, `/api/analyze`, `/api/health`
- **CORS:** root `vercel.json` sets `Access-Control-Allow-Origin: *` on `/api/*` — now actively used by terravalue.app
- **Tests:** 26/26 golden parity tests still passing

### willpark1895-spec/terravalue (React app)
- **Vercel:** disconnected. No project deploys this repo.
- **Git:** preserved. Last commit on `main` is `920dc8d` (May 9 CORS hotfix).
- **What's in it:** TerraValue.jsx (2,700+ lines), Leaflet map, PDF export, Soil Score, mobile responsive, parcel-data refactor, 6 federal-data integration modules (bypassed but committed). All available to port back if/when needed.

---

## What's pending

### Deferred to a future session (explicit user request, not yet prompted)
1. **Script-tag cutover on pxconsulting.io** per `CUTOVER-CHECKLIST.md`. The 1-week stability window since the May 4 API migration closes May 11 (tomorrow). Once you prompt for it, the task is: remove `<script src="terravalue-engine.js">` from `P&X/website/index.html` and `P&X/website/terravalue.html`, then delete the 2,345-line monolith at `P&X/website/terravalue-engine.js`. Hold until separately prompted.

### Now-obsolete (cutover changed the calculus)
2. **CORS proxy plan in `HANDOFF-CORS-PROXY.md`** — was written for the React app's `pullAllData()` call. Since terravalue.app no longer serves the React app, this is no longer blocking anything. The standalone HTML uses a simpler form-driven flow that doesn't need federal data auto-populate. If you ever want auto-populate on the standalone form, the same proxy plan still applies as a v2 feature — but it's not blocking work today.

### Real overhead from the cutover
3. **Duplication between `P&X/website/terravalue.html` and `P&X/terravalue-standalone/index.html`.** Per the standalone folder's README, the canonical home is now `terravalue-standalone/` (terravalue.app's source). `website/terravalue.html` should either be deleted, or collapsed to a redirect that sends `pxconsulting.io/terravalue.html` to `https://www.terravalue.app`. Same applies to the duplicated `terravalue-engine.js` in `website/`. Not urgent — but every future edit risks drift between the two copies.

### Still open from prior sessions
4. **Set `TERRAVALUE_API_KEY` env var on the P&X Vercel project** to gate the API. Currently open access. Standalone HTML doesn't send `X-API-Key`, so if you set this, you'll need to either add the header to the calculator's `fetch` calls or whitelist the terravalue.app origin in the API auth logic.
5. **Three sourcing items from the May 4 audit** — stormwater $520/canopy-acre citation, the 5% ecosystem cap rate, habitat $320 (already labeled benefit transfer).

---

## How to start the next session

In a new Cowork chat, paste the contents of `P&X/NEXT-SESSION-KICKOFF.md`. The kickoff has been refreshed to point at this handoff and to reflect that the React-repo CORS-proxy task is no longer the active work item.

If you want to do the script-tag cutover, override the "My ask for this session" line at the bottom of the kickoff with: *"Execute the script-tag cutover per `CUTOVER-CHECKLIST.md`. The 1-week stability window closed May 11; logs have been clean. Remove the local-engine fallback from index.html and terravalue.html, then delete the monolith."*

---

## Working rules (carried forward)

- Ask before starting big work
- Ask where to save files
- Path note: Desktop folder is nested inside `Desktop - a laptop/` because of iCloud sync. Always quote paths in bash.
- I push from my laptop. Generate paste-into-terminal commands; don't try to push from the sandbox.
- Ask permission before sharing my name or current employer in public-facing content
- Be an extension of the Soil Principle — work the foundations, not the appearances

---

## What this session accomplished (in order)

1. Read all prior handoff docs and master Session Summary; confirmed full project state
2. Confirmed the API migration shipped and the monolith was decomposed (`api/index.js` 496 lines, `lib/terravalue-engine.js` 1,771 lines, 5 config JSONs, 26 golden parity tests)
3. Diagnosed why the AVM copy wasn't showing on terravalue.app: brand-split commits (`fd9b574`, `d0d86bd`, `442ef07`) landed in the `px-website` repo, never propagated to the `terravalue` React repo that Vercel was deploying
4. Decided on Option B (cutover) over Option A (port copy into React app) — the standalone HTML is the canonical AVM surface per the May 5 plan
5. Edited `terravalue-standalone/index.html`: `API_BASE` → absolute `https://pxconsulting.io/api`; methodology-audit link → local `methodology-audit.md`; nav brand link → `/`
6. Wrote `terravalue-standalone/vercel.json` with security headers matching the main site
7. Pushed `71f67f6` to `px-website/main`
8. Walked through Vercel UI cutover: disconnect React repo, reconnect to `px-website`, set Root Directory to `terravalue-standalone`, change Framework Preset from Vite to Other, clear build overrides
9. Diagnosed two stale-state failures (Framework preset leftover; cached repo snapshot)
10. Pushed empty commit `b157f34` to force fresh Vercel clone
11. Cutover succeeded. www.terravalue.app now serves the AVM-voice page

**Net code shipped today:** 2 commits on `px-website/main` (`71f67f6`, `b157f34`).
**Net config shipped today:** 1 Vercel project repointed (Git source + Root Directory + Framework Preset all changed).
