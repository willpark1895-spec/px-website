# Deployment Map — Where Edits Go

**Last updated:** 2026-05-20

The canonical mapping of local folders → GitHub repos → Vercel projects → live URLs. If you're ever unsure where a change will end up, start here.

---

## The Two Projects

Both projects deploy from the **same repo** (`willpark1895-spec/px-website`), distinguished by Vercel's Root Directory setting. There is one local working directory and one `git push` — Vercel routes the rest.

### Project A — TerraValue (www.terravalue.app)

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/P&X/terravalue-standalone/` |
| GitHub repo | `github.com/willpark1895-spec/px-website` |
| Vercel Root Directory | `terravalue-standalone` |
| Framework Preset | Other (no build step) |
| Production URL | https://www.terravalue.app (apex `terravalue.app` also attached) |
| Deploys on | push to `main` |
| Stack | Static HTML + vendored `terravalue-engine.js` (client-side fallback) |
| Purpose | Standalone AVM-voice page — hero, Inside the Engine, Integration Surface, Sensitivity Analysis, Under the Hood, validation band, founder section |

**API behavior:** the page calls `https://pxconsulting.io/api/*` cross-origin via the `Access-Control-Allow-Origin: *` header set in root `vercel.json`. If the fetch fails, the bundled `terravalue-engine.js` provides a client-side fallback for `ECO_RATES`, `LandAppreciation.project()`, and `LandValuation.fullValuation()`.

### Project B — P&X Website + TerraValue API (pxconsulting.io)

| Field | Value |
|---|---|
| Local source | `~/Desktop/Desktop - a laptop/Claude-Work/P&X/website/` (HTML) + `api/`, `lib/`, `config/` |
| GitHub repo | `github.com/willpark1895-spec/px-website` (same repo) |
| Vercel Root Directory | (repo root) — `outputDirectory: "website"` set in root `vercel.json` |
| Framework Preset | Other |
| Production URL | https://pxconsulting.io |
| Deploys on | push to `main` |
| Stack | Static HTML + serverless Node API (`api/index.js`) |
| Purpose | P&X marketing site + the TerraValue serverless API |

**API routes:** `/api/ecosystem`, `/api/appreciation`, `/api/land-valuation`, `/api/valuation`, `/api/certifications`, `/api/analyze`, `/api/health`.

**Redirects:** `/terravalue` and `/terravalue.html` → `https://www.terravalue.app` (301, via root `vercel.json`).

---

## One repo, one push

Because both projects share the repo, **every change** — to the marketing site, the API, or the TerraValue page — is committed and pushed from the same place:

```bash
cd ~/Desktop/"Desktop - a laptop"/Claude-Work/"P&X"
git add -A
git commit -m "your message"
git push origin main
```

Vercel auto-deploys both projects on push. If only one Root Directory's files changed, only that project will produce new build artifacts, but both projects will see the deploy event.

---

## Environment variables in Vercel

**Project B (`px-website`, pxconsulting.io):**
- `TERRAVALUE_API_KEY` (optional, currently unset) — when set, external requests to `/api/*` must include `X-API-Key`. Same-origin requests from `pxconsulting.io` bypass auth. Cross-origin requests from `terravalue.app` would need either the header added to standalone `fetch` calls or an origin whitelist in API auth logic.

**Project A (terravalue.app):**
- None currently. The standalone page is static.

After adding or changing any env var, **trigger a redeploy** — Vercel does not auto-redeploy on env-var changes alone.

---

## The orphaned React app

`github.com/willpark1895-spec/terravalue` (local path: `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/`) was the original terravalue.app source. As of the May 10 Reading 3 cutover, it is **disconnected from Vercel** and no longer deploys anywhere. The repo is preserved in Git — Leaflet map, PDF export, parcel-data refactor, federal-data integration modules all still on `main` at commit `920dc8d`. Available to port if needed. **Do not push to it expecting a deploy.**

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

Confirm a folder is wired to the right repo:

```bash
cd <folder>
git remote -v
```

Confirm a Vercel project is wired to the right repo (in browser):

1. https://vercel.com/dashboard → click the project
2. Settings → Git → "Connected Git Repository" line
3. Settings → General → "Root Directory" line (this is what actually distinguishes A from B)

Confirm an env var is set:

1. Project → Settings → Environment Variables
2. After adding/changing, **trigger a redeploy**

---

## Duplicate Project Hygiene

If you ever see more than two projects in your Vercel dashboard pointing at this repo, one is likely a duplicate auto-created from a GitHub repo import. To verify before deleting:

1. Click the suspect project → **Settings → Git** → check the connected repo
2. Click **Settings → Domains** → confirm no real domain (`pxconsulting.io`, `terravalue.app`) is mapped to it
3. If only `*.vercel.app` URLs are mapped and the repo is `px-website`, it's a duplicate

Delete via: project's **Settings → General** → bottom of page → **Delete Project**.
