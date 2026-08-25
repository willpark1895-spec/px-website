# Deployment Map — Where Edits Go

**Last updated:** 2026-08-25 (close-out session — Jul 15 Instant Rollback incident documented, `terravalue-mvp` project added, exact engine pins recorded, stale paths fixed. Previous: 2026-06-08, workstream (b))

The canonical mapping of local folders → GitHub repos → npm packages → Vercel projects → live URLs. If you're ever unsure where a change will end up, start here.

---

## The hub-and-spoke architecture

As of 2026-05-26, TerraValue is split into three repos with one canonical engine published to npm. Each repo deploys to its own Vercel project. **One change ships to one place.**

```
                    ┌────────────────────────────────────────┐
                    │   @phloemxylem/terravalue-engine (npm) │
                    │   sole source of engine math — exact   │
                    │   pins per consumer, see below         │
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
| `Claude-Work/px-website/` | `willpark1895-spec/px-website` | API + marketing site (`pxconsulting.io`). Consumes engine via `require('@phloemxylem/terravalue-engine')` — pinned **`"1.3.0"` exact** (caret dropped 2026-08-24). |
| `Claude-Work/terravalue/` | `willpark1895-spec/terravalue` | Live TerraValue page (`terravalue.app`). Pulls engine bundle at Vercel build time. |
| `Claude-Work/terravalue-react-archive/` | `willpark1895-spec/terravalue-react-archive` | Orphaned React app, preserved for history. Disconnected from Vercel. Do not push expecting a deploy. |

---

## The three live Vercel projects

### Project 1 — pxconsulting.io + TerraValue API

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/px-website/` |
| GitHub repo | `github.com/willpark1895-spec/px-website` |
| Vercel Root Directory | (repo root) — `outputDirectory: "website"` in root `vercel.json` |
| Framework Preset | Other |
| Production URL | https://pxconsulting.io |
| Deploys on | push to `willpark1895-spec/px-website` main |
| Stack | Static HTML (`website/`) + serverless Node API (`api/index.js`) |
| Engine dependency | `require('@phloemxylem/terravalue-engine')` — npm dep declared in `package.json` |
| Purpose | P&X marketing site + the TerraValue serverless API |

**API routes:** `/api/ecosystem`, `/api/appreciation`, `/api/land-valuation`, `/api/valuation`, `/api/certifications`, `/api/analyze`, `/api/score` (POST-only), `/api/rates` (added in Phase C — F5 fix), `/api/parcel` (GET, added 2026-08-25 — M4 Fulton County live parcel lookup by address; returns provenanced lotSizeSqFt / assessedValue / canopyPct, declares buildingSqFt and yearBuilt unavailable, and returns the APPRAISED value TotAppr, never the 40% assessed figure), `/api/health` (reports `engineVersion` — the resolved npm package version — since 2026-08-24; its `version` field is a methodology string, not a package version).

**Redirects:** `/terravalue` and `/terravalue.html` → `https://www.terravalue.app` (301, via root `vercel.json`).

### Project 2 — terravalue.app (live TerraValue page)

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/` |
| GitHub repo | `github.com/willpark1895-spec/terravalue` (private, new — created 2026-05-26) |
| Vercel project name | `terravalue_v2` — shown as `terravaluev2` in URLs (the plain `terravalue` Vercel name was taken by the rollback project that workstream (b) removed) |
| Vercel Root Directory | (repo root) — `outputDirectory: "."` in `vercel.json` |
| Framework Preset | Other |
| Production URL | https://terravalue.app (apex 307s to `www.terravalue.app`) |
| Production alias | https://terravaluev2.vercel.app (serves production, not previews) |
| Deploys on | push to `willpark1895-spec/terravalue` main — **verified working 2026-08-25, but see the rollback warning below: a rollback pin silently suppresses promotion while builds keep succeeding** |
| Stack | Static HTML (`index.html`) + engine browser bundle pulled at build time via `npm install` postinstall hook |
| Engine dependency | `@phloemxylem/terravalue-engine` in `package.json`, pinned **`"1.1.0"` exact** (era-faithful MVP baseline; caret retired 2026-07-15 — see incident below for why caret specs are dangerous here). Browser bundle copied from `node_modules/.../dist/terravalue-engine.browser.js` into `./terravalue-engine.js` at build time. Bundle is **never** committed — gitignored. |
| Purpose | The TerraValue AVM-voice surface — hero, Inside the Engine, Integration Surface, Sensitivity Analysis, Under the Hood, validation band, founder section |

**API behavior:** the page calls `https://pxconsulting.io/api/*` cross-origin (CORS open via `Access-Control-Allow-Origin: *`). On init it does `GET /api/rates` to load ecosystem service rate constants. For sensitivity-analysis updates it POSTs to `/api/appreciation` and `/api/land-valuation`. The locally-bundled engine is the fallback if any of those calls fail.

**⚠️ THE JUL 15 → AUG 25 INSTANT ROLLBACK INCIDENT (why "deploys on push to main" silently stopped being true for 70 days):** on 2026-07-15 an `mvp`-branch WIP commit (`0e4a93a`) reached production on this project; William used Vercel **Instant Rollback** to restore the 2026-06-16 build (`95bcb78`) and the pin was never lifted. While pinned, every push still **built successfully** (previews and even production-track builds — they showed "Ready" with a staged/clock badge) but **nothing was promoted**, so the domains served June 16 until 2026-08-25, when the pin was found on the project Overview ("Rolled back Jul 15") and the `650e8f0` merge build was promoted, which undid the rollback. **Lesson: if production is frozen while deployments show green, check the project Overview for a rollback banner FIRST — before suspecting the production branch, the hook, or the build.** Related: while the June build was pinned, its bundle was engine **1.0.3** — a stale Vercel dependency-cache resolution of the old `^1.0.3` caret spec — even though 1.1.0 and 1.3.0 were published. Caret + build cache = nondeterministic engine on the wire; that is why both consumers now pin exact.

### Project 3 — terravalue-mvp (MVP staging surface, added ~2026-07-15)

| Field | Value |
|---|---|
| GitHub repo | `github.com/willpark1895-spec/terravalue` — **same repo as Project 2** |
| Production branch | **`mvp`** |
| Production URL | https://terravalue-mvp.vercel.app |
| Purpose | Staging/demo surface for the `mvp` branch. This is the host the Maps key runbook originally scoped its in-browser test to, and where the parcel finder was first proven. Auto-deploys on push to `mvp` (verified: picked up `5df1b9f` within minutes on 2026-08-25). |
| Maps key | The restricted key allowlists this host **and** (since 2026-08-25, verified) `terravalue.app` / `www.terravalue.app`, bare and `/*` forms — six entries total. |

**Two Vercel projects watch one repo.** A push to `mvp` deploys Project 3's production and a preview on Project 2; a push to `main` deploys Project 2's production only. Any session auditing "is the site current?" must hash **both** hosts against **both** branch HEADs — and the page's `terravalue-engine.js` bundle too, not just `index.html`.

---

## Source-of-truth diagram

```
Engine math       →  @phloemxylem/terravalue-engine (npm)
                  →  willpark1895-spec/terravalue-engine (GitHub)

API + marketing   →  willpark1895-spec/px-website (GitHub)
                  →  Vercel project: "pxconsulting.io"
                  →  pxconsulting.io
                  ←  consumes engine via require('@phloemxylem/terravalue-engine')

Live frontend     →  willpark1895-spec/terravalue (GitHub), branch main
                  →  Vercel project: "terravalue_v2"
                  →  terravalue.app (canonical: www.terravalue.app) + terravaluev2.vercel.app
                  ←  consumes engine 1.1.0 (exact pin) via build-step copy from node_modules/
                  ←  calls pxconsulting.io/api/* cross-origin

MVP staging       →  willpark1895-spec/terravalue (GitHub), branch mvp   ← SAME repo
                  →  Vercel project: "terravalue-mvp"
                  →  terravalue-mvp.vercel.app

Archive           →  willpark1895-spec/terravalue-react-archive (GitHub)
                  →  no Vercel project
                  →  no live URL
```

---

## How to ship a change

| Want to change… | Edit in… | Push to… | What deploys |
|---|---|---|---|
| Engine math, validation, configs | `Claude-Work/terravalue-engine/` | `willpark1895-spec/terravalue-engine` → publish v1.0.x to npm → bump dep in consumers | Both Project 1 and Project 2 redeploy on their next push |
| API routes, marketing site at pxconsulting.io | `Claude-Work/P&X/` | `willpark1895-spec/px-website` | Project 1 (pxconsulting.io). |
| terravalue.app page (HTML, copy, links) | `Claude-Work/terravalue/` | `willpark1895-spec/terravalue` | Project 2 only |

**Critical:** to change engine behavior, you must (1) ship a new engine version to npm, (2) bump the dep in both `P&X/package.json` and `terravalue/package.json`. The engine code is no longer editable from within the consumers.

---

## Engine version coordination

~~Both consumers declare `"@phloemxylem/terravalue-engine": "^1.0.1"`…~~ **Caret specs are retired** (2026-07-15 frontend, 2026-08-24 API) after the build-cache incident above. Current exact pins, verified on the wire 2026-08-25:

| Consumer | Pin | Verified how |
|---|---|---|
| `px-website` (API) | `"1.3.0"` | `/api/health` → `engineVersion: "1.3.0"` in production |
| `terravalue` (page bundle) | `"1.1.0"` | served `terravalue-engine.js` sha256-identical to npm 1.1.0 `dist/` |

The 1.1.0-bundle ↔ 1.3.0-lib pairing is proven output-identical across all four golden fixture groups by `terravalue-engine`'s `npm run parity:deployed`; re-run it after changing either pin, and bump both in lockstep for any major. Note: npm `latest` is 1.4.0 and the engine **repo** is ahead of the npm 1.4.0 artifact (Session A landed without a version bump) — bump the version before the next publish, never republish 1.4.0.

---

## Environment variables in Vercel

**Project 1 (`pxconsulting.io`):**
- `TERRAVALUE_API_KEY` (optional, currently unset) — when set, external requests to `/api/*` must include `X-API-Key`. Same-origin from `pxconsulting.io` bypasses auth. Cross-origin from `terravalue.app` would need the header added to standalone `fetch` calls or an origin whitelist in `api/index.js` auth logic.

**Project 2 (`terravalue.app`):**
- None currently. The page is static; only its build process pulls the engine via npm.

After adding or changing any env var, **trigger a redeploy** — Vercel does not auto-redeploy on env-var changes alone.

---

## Pending cleanup (post-Phase-C)

_Complete._ The `terravalue-standalone/` source and the dormant Project 3 rollback anchor were removed in workstream (b) (this commit). The `Outside-View-Memo.js` / `TerraValue-Outside-View.docx` files were archived to `Claude-Work/archive/009-outside-view-memo-2026-05-23/` during Phase E.

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
3. Settings → General → "Root Directory" line
4. Settings → Domains — confirms which custom domain (if any) is attached

Confirm the engine version that's actually live in production:

```bash
# from your laptop, no install needed
curl -s https://registry.npmjs.org/@phloemxylem%2fterravalue-engine | python3 -c "import sys, json; d=json.load(sys.stdin); print('latest:', d['dist-tags']['latest'])"

# what version does pxconsulting.io's API report? (engineVersion = npm package version;
# the 'version' field is a methodology string — do not confuse them)
curl -s https://pxconsulting.io/api/health | python3 -c "import sys, json; print('API engine version:', json.load(sys.stdin)['engineVersion'])"

# what version is terravalue.app actually serving? Don't trust strings — hash the bundle
# and byte-compare against the npm dist (this is how the 1.0.3 cache-ghost was caught):
curl -sL https://www.terravalue.app/terravalue-engine.js | shasum -a 256
npm pack @phloemxylem/terravalue-engine@1.1.0 >/dev/null 2>&1 && tar -xzf phloemxylem-terravalue-engine-1.1.0.tgz && shasum -a 256 package/dist/terravalue-engine.browser.js  # must match the line above

# and hash the page itself against the branch HEAD (audit the wire, not the file):
curl -sL "https://www.terravalue.app/?cb=$(date +%s)" | shasum -a 256
git -C ~/Desktop/"Desktop - a laptop"/Claude-Work/terravalue show main:index.html | shasum -a 256  # must match
```

---

## Rollback procedure (Phase C undo)

The fast (~5-minute) domain-swap rollback was retired along with Project 3 in workstream (b). The pre-Phase-C standalone is no longer deployed.

To recover it if ever needed:

1. Restore the source on `px-website`: `git revert <workstream-b-commit>` (or `git checkout <commit>~1 -- terravalue-standalone`) to bring back `terravalue-standalone/`.
2. Recreate a Vercel project from `px-website` with Root Directory `terravalue-standalone`.
3. Move `terravalue.app` + `www.terravalue.app` from Project 2 (`terravaluev2`) to the recreated project under Settings → Domains.

Total time: ~20–30 minutes (full project recreation, not a domain swap). This added cost is why the architecture ran a 7-day soak before (b).
