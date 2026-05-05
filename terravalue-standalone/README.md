# TerraValue — Standalone deploy candidate

This folder is the **Reading 3** lift-and-shift target for the TerraValue brand split.

## What's in here

- `index.html` — The TerraValue marketing surface. Currently a copy of `../website/terravalue.html`. Under Reading 2 (May 2026) this file lives in two places; under Reading 3 the canonical copy moves here and the duplicate at `../website/terravalue.html` is deleted.
- `terravalue-engine.js` — Calculation engine. Same file as `../website/terravalue-engine.js`. Eventually moves to its own package or stays vendored here.
- `methodology-audit.md` — Copy of `../TerraValue-Audit-Report.md`, served from this folder so the "Read the methodology audit" link works under standalone deploy.

## Reading 2 vs Reading 3 — current state

**Reading 2 (current, May 2026):** TerraValue marketing lives at `../website/terravalue.html`. Branding, nav, footer, meta tags, and contact CTAs are fully separated from P&X. Both pages still deploy together to pxconsulting.io. This folder exists but is not yet wired to a deploy.

**Reading 3 (next):** This folder becomes the canonical TerraValue surface. Steps:
1. Stand up Vercel project pointed at this folder
2. Point `terravalue.app` (or `terravalue.io`) DNS at the new project
3. Delete `../website/terravalue.html` and `../website/terravalue-engine.js`
4. Update the small TerraValue methodology-credit section on `../website/index.html` to link to the new TerraValue domain (already pointing at `https://terravalue.app` — should still work)
5. Update the API base in `terravalue-engine.js` and `index.html` if the API moves with it

## Why two copies for now

Single source of truth would be cleaner, but Reading 2 explicitly avoids touching DNS or deploys. Keeping a duplicate here lets you preview what the standalone deploy will look like (open `index.html` in a browser) without disturbing the live pxconsulting.io site.

If you change one, sync the other until Reading 3 is executed. There are exactly three files to keep in sync:
- `index.html` ↔ `../website/terravalue.html`
- `terravalue-engine.js` ↔ `../website/terravalue-engine.js`
- `methodology-audit.md` ↔ `../TerraValue-Audit-Report.md`

## Reading 3 trigger

Per the kickoff doc, the operational sequence before Reading 3 is:
1. Run `node tests/e2e-validate.js` against the live Vercel deploy
2. Set `TERRAVALUE_API_KEY` env var on Vercel + DNS for pxconsulting.io
3. After 1+ week stable, execute the script-tag cutover per `CUTOVER-CHECKLIST.md`
4. Then Reading 3: stand up TerraValue at its own domain
