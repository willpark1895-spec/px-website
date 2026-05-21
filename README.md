# P&X — Source of Truth

**Last updated:** 2026-05-20

This folder is the working directory for **P&X (Phloem & Xylem)** — the natural-resource consulting practice — and **TerraValue**, the ecosystem-aware AVM founded out of P&X. It is also the local clone of the `willpark1895-spec/px-website` Git repo, which deploys to two Vercel projects (see `VERCEL-PROJECTS.md`).

## Where things live

### Live production code (also in Git)

| Path | What it is |
|---|---|
| `website/` | Source for **pxconsulting.io** — P&X marketing site + embedded TerraValue calculator. Vercel project: `px-website`, Root Directory `website`. |
| `terravalue-standalone/` | Source for **www.terravalue.app** — the standalone AVM-voice page. Vercel project: separate, Root Directory `terravalue-standalone`. Calls the P&X API cross-origin. |
| `api/`, `lib/`, `config/` | The TerraValue serverless API and engine. Deployed to `pxconsulting.io/api/*`. |
| `tests/` | 26 golden parity tests + e2e validator. Run with `node --test tests/golden-parity.test.js`. |
| `vercel.json` | Root Vercel config: API rewrites, CORS headers, security headers, and the `/terravalue` → `terravalue.app` redirect. |

### Canonical docs (this folder)

| File | Purpose |
|---|---|
| `README.md` | **You are here.** Index of canonical docs and current state. |
| `NEXT-SESSION-KICKOFF.md` | Entry point for every new Cowork session. Paste into a new chat to bring Claude up to speed. |
| `SESSION-HANDOFF-2026-05-10.md` | Most recent session handoff. Describes the Reading 3 cutover (terravalue.app cutover from React app to standalone HTML). |
| `VERCEL-PROJECTS.md` | Deployment map: local folder → GitHub repo → Vercel project → live URL. |
| `CUTOVER-CHECKLIST.md` | Held runbook for the script-tag cutover (remove the local-engine fallback from `website/index.html`, then delete the monolith `website/terravalue-engine.js`). |
| `TerraValue-Positioning-Brief.md` | Strategy doc: the ecosystem-aware AVM category, one-line positioning, audiences. v0.1 (April 29). |
| `TerraValue-Feature-Prioritization.md` | Strategy doc: the P0/P1/P2 backlog. v0.1 (April 29). |
| `PX-Business-Plan.pdf` | The P&X business plan. |
| `PX-Partner-Overview.pdf` | External-facing partner overview. |

### History

| Path | What's in it |
|---|---|
| `archive/handoffs/` | All prior session handoffs and one-shot task handoffs (CORS proxy, deploy routing, API migration planning). Each has a status banner explaining why it was archived. |
| `archive/audits/` | Methodology and pre-deploy audits. Findings have been worked through; the docs remain as their source. |
| `archive/README.md` | Quick index of the archive and how the handoffs chain chronologically. |

### Cross-folder references

| Path | What's in it |
|---|---|
| `~/Desktop/Desktop - a laptop/Claude-Work/Outputs/William Park - Session Summary.md` | Master through-line covering everything William has worked on across sessions (career, P&X, TerraValue). Lives outside P&X/ because it spans multiple workstreams. Referenced by `NEXT-SESSION-KICKOFF.md`. |
| `~/Desktop/Desktop - a laptop/Claude-Work/terravalue/` | Local clone of the orphaned React app (`willpark1895-spec/terravalue`). Not deploying anywhere since the 2026-05-10 Reading 3 cutover. Preserved for porting work back if ever needed. |

## Current state — May 20, 2026

- **Two domains, one repo.** `pxconsulting.io` serves `website/`; `www.terravalue.app` serves `terravalue-standalone/`. Both via the same `willpark1895-spec/px-website` Git repo with different Vercel Root Directories.
- **The TerraValue API is live** at `pxconsulting.io/api/*` (endpoints: `/ecosystem`, `/appreciation`, `/land-valuation`, `/valuation`, `/certifications`, `/analyze`, `/health`). 26/26 golden parity tests passing. Cross-origin to terravalue.app via `Access-Control-Allow-Origin: *` in `vercel.json`.
- **The duplication is gone.** `website/terravalue.html` was deleted on May 20, 2026 — `pxconsulting.io/terravalue` and `/terravalue.html` now 301-redirect to `https://www.terravalue.app`. `terravalue-standalone/` is the canonical TerraValue surface.
- **The React app at `willpark1895-spec/terravalue`** is orphaned from Vercel but preserved in Git. Leaflet map, PDF export, parcel-data refactor, federal-data integrations all available to port if needed.

## Active backlog

In priority order (mirrors `NEXT-SESSION-KICKOFF.md`):

1. **Set `TERRAVALUE_API_KEY`** on the `px-website` Vercel project to gate the API (currently open access). Will require adding an `X-API-Key` header to the standalone calculator's `fetch` calls or whitelisting the terravalue.app origin in API auth.
2. **Three audit sourcing items** — stormwater $520/canopy-acre citation, the 5% ecosystem cap rate, habitat $320 (already labeled benefit transfer).

The script-tag cutover (`CUTOVER-CHECKLIST.md`) is **closed** as of 2026-05-20.

## Working rules

- Ask before starting big work; ask where to save files.
- Path note: the Desktop folder is nested inside `Desktop - a laptop/` because of iCloud sync. The right path is always `~/Desktop/Desktop - a laptop/Claude-Work/...`. Quote `Desktop - a laptop` in bash.
- Pushes happen from William's laptop, not the sandbox. Generate paste-into-terminal commands.
- Ask permission before sharing William's name or current employer in public-facing content.
- Soil Principle: work the foundations, not the appearances.
