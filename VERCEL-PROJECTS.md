# Deployment Map — Where Edits Go

**Last updated:** 2026-05-26 (post hub-and-spoke refactor, Phases A–C)

The canonical mapping of local folders → GitHub repos → npm packages → Vercel projects → live URLs. If you're ever unsure where a change will end up, start here.

---

## The hub-and-spoke architecture

As of 2026-05-26, TerraValue is split into three repos with one canonical engine published to npm. Each repo deploys to its own Vercel project. **One change ships to one place.**

```
                    ┌────────────────────────────────────────┐
                    │   @phloemxylem/terravalue-engine 1.0.1 │
                    │   (npm — sole source of engine math)   │
                    └─────────────┬──────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
            require()                       npm install + cp
                  │                               │
                  ▼                               ▼
        ┌─────────────────────┐         ┌─────────────────────┐
        │   px-website        │         │   terravalue        │
        │   (API + marketing) │         │   (live frontend)   │
        │   pxconsulting.io   │ ◀───────│   terravalue.app    │
        └─────────────────────┘  /api/* └─────────────────────┘
                                 (CORS)
```

The standalone frontend calls the API cross-origin. The API uses the engine via `require()`. Both stay in sync because both depend on the same npm version of the engine, not on each other's source.

---

## The three repos

| Local path | GitHub | Role |
|---|---|---|
| `Claude-Work/terravalue-engine/` | `willpark1895-spec/terravalue-engine` | Engine. Published to npm as `@phloemxylem/terravalue-engine`. Sole source of math + validation. |
| `Claude-Work/P&X/` | `willpark1895-spec/px-website` | API + marketing site (`pxconsulting.io`). Consumes engine via `require('@phloemxylem/terravalue-engine')`. |
| `Claude-Work/terravalue/` | `willpark1895-spec/terravalue` | Live TerraValue page (`terravalue.app`). Pulls engine bundle at Vercel build time. |
| `Claude-Work/terravalue-react-archive/` | `willpark1895-spec/terravalue-react-archive` | Orphaned React app, preserved for history. Disconnected from Vercel. Do not push expecting a deploy. |

---

## The three live Vercel projects

### Project 1 — pxconsulting.io + TerraValue API

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/P&X/` |
| GitHub repo | `github.com/willpark1895-spec/px-website` |
| Vercel Root Directory | (repo root) — `outputDirectory: "website"` in root `vercel.json` |
| Framework Preset | Other |
| Production URL | https://pxconsulting.io |
| Deploys on | push to `willpark1895-spec/px-website` main |
| Stack | Static HTML (`website/`) + serverless Node API (`api/index.js`) |
| Engine dependency | `require('@phloemxylem/terravalue-engine')` — npm dep declared in `package.json` |
| Purpose | P&X marketing site + the TerraValue serverless API |

**API routes:** `/api/ecosystem`, `/api/appreciation`, `/api/land-valuation`, `/api/valuation`, `/api/certifications`, `/api/analyze`, `/api/rates` (added in Phase C — F5 fix), `/api/health`.

**Redirects:** `/terravalue` and `/terravalue.html` → `https://www.terravalue.app` (301, via root `vercel.json`).

### Project 2 — terravalue.app (live TerraValue page)

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/` |
| GitHub repo | `github.com/willpark1895-spec/terravalue` (private, new — created 2026-05-26) |
| Vercel project name | `terravaluev2` (the `terravalue` Vercel name was already taken by Project 3 below) |
| Vercel Root Directory | (repo root) — `outputDirectory: "."` in `vercel.json` |
| Framework Preset | Other |
| Production URL | https://terravalue.app (apex 307s to `www.terravalue.app`) |
| Preview URL | https://terravaluev2.vercel.app |
| Deploys on | push to `willpark1895-spec/terravalue` main |
| Stack | Static HTML (`index.html`) + engine browser bundle pulled at build time via `npm install` postinstall hook |
| Engine dependency | `@phloemxylem/terravalue-engine` in `package.json`. Browser bundle copied from `node_modules/.../dist/terravalue-engine.browser.js` into `./terravalue-engine.js` at build time. Bundle is **never** committed — gitignored. |
| Purpose | The TerraValue AVM-voice surface — hero, Inside the Engine, Integration Surface, Sensitivity Analysis, Under the Hood, validation band, founder section |

**API behavior:** the page calls `https://pxconsulting.io/api/*` cross-origin (CORS open via `Access-Control-Allow-Origin: *`). On init it does `GET /api/rates` to load ecosystem service rate constants. For sensitivity-analysis updates it POSTs to `/api/appreciation` and `/api/land-valuation`. The locally-bundled engine is the fallback if any of those calls fail.

### Project 3 — terravalue (rollback anchor, dormant)

| Field | Value |
|---|---|
| Local source | (none — was `P&X/terravalue-standalone/` before Phase C; that folder is now scheduled for cleanup) |
| GitHub repo | `github.com/willpark1895-spec/px-website` |
| Vercel Root Directory | `terravalue-standalone` |
| Framework Preset | Other (no build step) |
| Production URL | (none currently) |
| Preview URL | https://terravalue-willpark1895-specs-projects.vercel.app/ |
| Custom domain | **None.** `terravalue.app` was removed from this project on 2026-05-26 and reattached to Project 2. |
| Stack | Static HTML + vendored 2,345-LOC `terravalue-engine.js` fallback. Pre-hub-and-spoke architecture. |
| Purpose | **Rollback anchor only.** If Phase C ever needs to be undone, re-add `terravalue.app` to this project in the Vercel UI (~30s cutover). |

**Why we keep it alive:** the Vercel UI takes seconds to swap a domain back, but recreating this project from scratch would take longer than the on-call urgency we'd be in if we needed it. `P&X/terravalue-standalone/` source still exists in `px-website` until cleanup (see "Pending cleanup" below).

---

## Source-of-truth diagram

```
Engine math       →  @phloemxylem/terravalue-engine (npm)
                  →  willpark1895-spec/terravalue-engine (GitHub)

API + marketing   →  willpark1895-spec/px-website (GitHub)
                  →  Vercel project: "pxconsulting.io"
                  →  pxconsulting.io
                  ←  consumes engine via require('@phloemxylem/terravalue-engine')

Live frontend     →  willpark1895-spec/terravalue (GitHub)
                  →  Vercel project: "terravaluev2"
                  →  terravalue.app (canonical: www.terravalue.app)
                  ←  consumes engine via build-step copy from node_modules/
                  ←  calls pxconsulting.io/api/* cross-origin

Dormant rollback  →  Vercel project: "terravalue" (same px-website repo, root: terravalue-standalone/)
                  →  terravalue-willpark1895-specs-projects.vercel.app
                  →  no domain assigned

Archive           →  willpark1895-spec/terravalue-react-archive (GitHub)
                  →  no Vercel project
                  →  no live URL
```

---

## How to ship a change

| Want to change… | Edit in… | Push to… | What deploys |
|---|---|---|---|
| Engine math, validation, configs | `Claude-Work/terravalue-engine/` | `willpark1895-spec/terravalue-engine` → publish v1.0.x to npm → bump dep in consumers | Both Project 1 and Project 2 redeploy on their next push |
| API routes, marketing site at pxconsulting.io | `Claude-Work/P&X/` | `willpark1895-spec/px-website` | Project 1 (pxconsulting.io). Project 3 also rebuilds because they share the repo, but no live consequence. |
| terravalue.app page (HTML, copy, links) | `Claude-Work/terravalue/` | `willpark1895-spec/terravalue` | Project 2 only |

**Critical:** to change engine behavior, you must (1) ship a new engine version to npm, (2) bump the dep in both `P&X/package.json` and `terravalue/package.json`. The engine code is no longer editable from within the consumers.

---

## Engine version coordination

Both consumers declare `"@phloemxylem/terravalue-engine": "^1.0.1"` in their `package.json`. With caret semver they'll both pick up any future `1.x.x` (non-breaking) release on their next `npm install`. For a major bump (2.0.0), update both `package.json`s in lockstep — push the engine first, then the consumers, otherwise the API will be a major version ahead/behind the frontend.

---

## Environment variables in Vercel

**Project 1 (`pxconsulting.io`):**
- `TERRAVALUE_API_KEY` (optional, currently unset) — when set, external requests to `/api/*` must include `X-API-Key`. Same-origin from `pxconsulting.io` bypasses auth. Cross-origin from `terravalue.app` would need the header added to standalone `fetch` calls or an origin whitelist in `api/index.js` auth logic.

**Project 2 (`terravalue.app`):**
- None currently. The page is static; only its build process pulls the engine via npm.

**Project 3 (dormant):**
- None. The project is alive but doesn't serve any custom domain. No env vars needed.

After adding or changing any env var, **trigger a redeploy** — Vercel does not auto-redeploy on env-var changes alone.

---

## Pending cleanup (post-Phase-C)

- `P&X/terravalue-standalone/` — the old standalone source. Project 3 still deploys from it (as the rollback anchor), so **don't delete it until Project 3 is also deleted.** Recommended timeline: ~7 days of `terravalue.app` running cleanly on the new architecture, then delete Project 3 and the `terravalue-standalone/` folder in the same commit on `px-website`.
- `P&X/Outside-View-Memo.js` and `P&X/TerraValue-Outside-View.docx` — untracked since well before today. Need a deliberate fate in Phase E: either commit to `P&X` properly or move to `Claude-Work/archive/`.

---

## Important Path Note (iCloud Desktop Sync)

The `Desktop` folder lives inside `~/Desktop/Desktop - a laptop/` because of iCloud Desktop sync across multiple Macs. Every path that says `~/Desktop/Claude-Work/...` in older handoff docs is wrong — the real path includes the `Desktop - a laptop/` layer.

**Optional fix** (one time, makes every old path work via symlink):

```bash
ln -s ~/Desktop/"Desktop - a laptop"/Claude-Work ~/Desktop/Claude-Work
```

After that, both `~/Desktop/Claude-Work/...` and `~/Desktop/"Desktop - a laptop"/Claude-Work/...` resolve to the same place.

---

## Quick Sanity Checks

Confirm a local folder is wired to the right repo:

```bash
cd <folder>
git remote -v
```

Confirm a Vercel project is wired to the right repo (in browser):

1. https://vercel.com/dashboard → click the project
2. Settings → Git → "Connected Git Repository" line
3. Settings → General → "Root Directory" line (this is what distinguishes Project 1 from Project 3 — both connect to `px-website`)
4. Settings → Domains — confirms which custom domain (if any) is attached

Confirm the engine version that's actually live in production:

```bash
# from your laptop, no install needed
curl -s https://registry.npmjs.org/@phloemxylem%2fterravalue-engine | python3 -c "import sys, json; d=json.load(sys.stdin); print('latest:', d['dist-tags']['latest'])"

# what version does pxconsulting.io's API report?
curl -s https://pxconsulting.io/api/health | python3 -c "import sys, json; print('API engine version:', json.load(sys.stdin)['version'])"

# what version is terravalue.app actually serving?
curl -sL https://terravalue.app/terravalue-engine.js | grep -m1 "Generated:"
```

---

## Rollback procedure (Phase C undo)

If `terravalue.app` ever needs to revert to the pre-Phase-C architecture:

1. Vercel dashboard → **Project 2 (terravaluev2)** → Settings → Domains → remove `terravalue.app` and `www.terravalue.app`
2. Vercel dashboard → **Project 3 (terravalue)** → Settings → Domains → add `terravalue.app` and `www.terravalue.app` back
3. Verify: `curl -sIL https://terravalue.app/` should resolve to the old project (no IIFE wrap in `terravalue-engine.js`, `loadRates()` should POST to `/api/ecosystem`)

Total time: ~5 minutes. Project 3 stays alive specifically to make this possible.
