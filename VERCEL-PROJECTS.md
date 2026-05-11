# Deployment Map — Where Edits Go
**Last verified:** May 9, 2026

The canonical mapping of local folders → GitHub repos → Vercel projects → live URLs. If you're ever unsure where a change will end up, start here.

---

## The Two Projects

### Project A — TerraValue (standalone React app)

| Field | Value |
|---|---|
| Local path | `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/` |
| GitHub repo | `github.com/willpark1895-spec/terravalue` |
| Vercel project name | `terravalue` |
| Production URL | https://www.terravalue.app |
| Deploys on | push to `main` |
| Stack | Vite + React + Leaflet + jsPDF |
| Purpose | Standalone parcel-level ecosystem services calculator |

**Edits in `Claude-Work/terravalue/` go here.** Push from that folder:

```bash
cd ~/Desktop/"Desktop - a laptop"/Claude-Work/terravalue
git add -A
git commit -m "your message"
git push origin main
```

**Environment variables in Vercel:**
- `VITE_AIRNOW_API_KEY` — AirNow API key (set May 9, 2026). Currently unused at runtime because the integration is bypassed pending the CORS proxy.

---

### Project B — P&X Website + TerraValue API

| Field | Value |
|---|---|
| Local path | `~/Desktop/Desktop - a laptop/Claude-Work/P&X/` |
| GitHub repo | `github.com/willpark1895-spec/px-website` |
| Vercel project name | `px-website` |
| Production URL | https://pxconsulting.io |
| Deploys on | push to `main` |
| Stack | Static HTML + serverless Node API (`api/index.js`) |
| Purpose | P&X marketing site, embedded TerraValue product page, and the standalone API the React app will call once the CORS proxy is built |

**Edits in `Claude-Work/P&X/` go here.** Push from that folder:

```bash
cd ~/Desktop/"Desktop - a laptop"/Claude-Work/"P&X"
git add -A
git commit -m "your message"
git push origin main
```

**Environment variables in Vercel:**
- `TERRAVALUE_API_KEY` (optional) — when set, external requests must include `X-API-Key`. Same-origin requests from `pxconsulting.io` itself bypass auth. Currently unset (open access).

---

## How They Relate

The two projects share the same calculation engine but in different forms:

- The **standalone TerraValue app** (terravalue.app) bundles `terravalue-engine.js` directly in the React build — runs entirely client-side.
- The **P&X site** (pxconsulting.io) embeds an HTML version of TerraValue at `/terravalue` AND hosts the serverless API at `/api/*`. The HTML version calls `/api/*` first and falls back to the inlined `terravalue-engine.js` on error.

**As of May 9, 2026:** the standalone React app does NOT yet call the P&X API. It still bundles its own engine. A queued task (`HANDOFF-CORS-PROXY.md`) will route the React app's federal-data integrations through P&X serverless proxy routes — both to unblock CORS and to start moving toward a single source of truth.

---

## Important Path Note (iCloud Desktop Sync)

Your `Desktop` folder lives inside `~/Desktop/Desktop - a laptop/` because of iCloud Desktop sync across multiple Macs. Every path that says `~/Desktop/Claude-Work/...` in older handoff docs is wrong — the real path includes the `Desktop - a laptop/` layer.

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

Confirm an env var is set on Vercel:

1. Project → Settings → Environment Variables
2. After adding/changing, **trigger a redeploy** — Vercel does not auto-redeploy on env var changes alone

---

## Duplicate Project Hygiene

If you ever see more than two projects in your Vercel dashboard, one is likely a duplicate auto-created from a GitHub repo import. To verify before deleting:

1. Click the suspect project → **Settings → Git** → check the connected repo
2. Click **Settings → Domains** → confirm no real domain (`pxconsulting.io`, `terravalue.app`) is mapped to it
3. If only `*.vercel.app` URLs are mapped and the repo matches one of the two above, it's a duplicate

Delete via: project's **Settings → General** → bottom of page → **Delete Project**.
