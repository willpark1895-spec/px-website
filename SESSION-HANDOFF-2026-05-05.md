# Session Handoff — May 5, 2026

**Session theme:** Strategic sharpening + brand split + AVM positioning rewrite.
**Two commits shipped to `main`:** `fd9b574` (brand split) and `d0d86bd` (AVM-voice body + P&X credit corrected).
**Status:** Code is clean and pushed. One Vercel deploy issue is open and unresolved — see "Open Issue" below.

---

## What changed strategically

The session started with a question — what to do next, given the gap between the positioning brief and the prioritization matrix — and ended with a sharper, more committed posture:

- **TerraValue is the company.** It is the *Ecosystem-aware AVM*. Everything else exists to support that tool.
- **Residential homeowner / broker / tax-appeal surface is now framed as a case-study production layer**, not a primary revenue line. Generates paired-sales data and field testimonials for the institutional validation study. Minimal income by design.
- **Tax appeal demoted from P0 to P1**, gated on the validation-study data pipeline (estimated 3–4 founder-weeks for an MVP, but only ~2 weeks once the broker / MLS infrastructure for #4 + #8 exists).
- **Validation study (#8) and broker design partner (#4) are the strategic spine of the next 90 days.** Patent provisional (#6) is the only other true P0.
- **Brand split executed (Reading 2):** TerraValue and P&X are now structurally separate marketing surfaces in the same repo. Reading 3 (separate Vercel project + DNS) is queued.
- **Founder credit flow corrected:** P&X is the practice TerraValue was founded out of. P&X is "you" pre-incorporation. Honest copyright: `© 2026 P&X (William Park)`.

---

## What changed in the code

Two commits on `main` of `github.com/willpark1895-spec/px-website`:

### `fd9b574` — Brand split (Reading 2)
- `terravalue.html` got its own nav, footer, meta tags, tagline, copyright. All `index.html#...` cross-links removed.
- `index.html` got its TerraValue spotlight collapsed to a one-paragraph methodology credit. Calculator JS and engine script tag stripped.
- New folder `terravalue-standalone/` created with copies of `index.html`, `terravalue-engine.js`, `methodology-audit.md`, plus a README. This is the Reading 3 lift-and-shift candidate.
- All institutional CTAs route to `hello@pxconsulting.io` with subject lines for inbox routing (API access, validation study, contact).
- Premium consultant section deleted from terravalue.html (lives on pxconsulting.io now).

### `d0d86bd` — AVM-voice body rewrite + P&X credit corrected
- TerraValue body sections rewritten in AVM voice end-to-end:
  - "How It Works" → **"Inside the Engine"** (USPAP three-approach, audit-grade JSON output framing)
  - "Six ecosystem services, quantified" → **"Six ecosystem services the AVM consumes"** (explicit integrator framing)
  - "Value Projector" → **"Sensitivity Analysis"** (residual response curve)
  - "Connected Jurisdictions" → **"Launch Geography"** (1.2M parcels live, national pipeline framing)
- Two new institutional bands inserted:
  - **"Integration Surface — What an AVM buyer integrates"** — request/response JSON code blocks, three integration patterns (drop-in residual / standalone score / portfolio batch), compliance row, API CTA
  - **"Under the Hood"** — four-card data infrastructure grid (Connected Jurisdictions, Calculation Sources, Engine & Pipeline, Compliance & Standards) + green-badge credibility row
- P&X credit flow corrected:
  - Hero: gold "Founded out of P&X — Phloem & Xylem" line under the subhead
  - Founder section reframed: leads with P&X as the consulting practice TerraValue was founded out of, then introduces William Park as P&X's founder
  - Footer: visible "Founded out of P&X" line under tagline, copyright reads "© 2026 P&X (William Park)"
- P&X side: "P&X is the methodology source for TerraValue" → **"P&X built TerraValue"**

---

## Open issue (not resolved this session)

**TerraValue edits are deploying to `terravalue-z43u.vercel.app` instead of `www.terravalue.app`.**

Diagnosis was started but not completed. Three possibilities, in likelihood order:

1. The `www.terravalue.app` domain is attached to a different Vercel project than the one receiving pushes from `willpark1895-spec/px-website`
2. There's no project for terravalue.app yet; `terravalue-z43u.vercel.app` is just an auto-generated preview URL of the px-website project
3. DNS for `terravalue.app` is misconfigured at the registrar level

**To diagnose, William needs to look at the Vercel dashboard and report:**
- How many Vercel projects exist
- Which project owns `www.terravalue.app` (Settings → Domains)
- Which project is connected to `willpark1895-spec/px-website` (Settings → Git)
- What got deployed to the `terravalue-z43u` URL — was it `website/terravalue.html`?

**Once diagnosed, the recommended fix is Option B (two projects, same repo, different output paths):**
- Project A: serves `website/` to `pxconsulting.io` (already exists)
- Project B: serves `website/terravalue.html` (or `terravalue-standalone/`) to `www.terravalue.app` — needs to be configured or fixed
- Both auto-deploy from `main`. Switching to Option C (full Reading 3) later is just changing Project B's output directory.

**Reading 3 (full standalone deploy) is still queued for later** — kickoff doc says wait for 1+ week of stability before script-tag cutover.

---

## Repo state

- Branch: `main`, up to date with `origin/main`
- Last 5 commits:
  - `d0d86bd` AVM-voice body rewrite + P&X credit corrected
  - `fd9b574` Brand split (Reading 2): TerraValue as standalone AVM surface
  - `5fc90ce` Session handoff: May 4, 2026 — API migration + phantom fixes shipped
  - `0ba5fc7` Ignore macOS .DS_Store files
  - `235e7a5` Docs: audit report (5 phantom-data findings, all fixed in 66225b5)
- Working tree: clean
- Unstaged changes: none

---

## What's pending (priority order)

**Operational (from prior sessions, still open):**
1. **Resolve the Vercel deploy routing for terravalue.app** (today's open issue)
2. Run `node tests/e2e-validate.js https://YOUR-VERCEL-URL.vercel.app` against the live deploy
3. Set `TERRAVALUE_API_KEY` env var on Vercel + DNS for pxconsulting.io
4. After 1+ week stable, execute the script-tag cutover per `CUTOVER-CHECKLIST.md`

**Strategic (from this session's framing):**
5. **File the patent provisional** (matrix #6) — week 1, $3–5K, unblocks every institutional conversation
6. **Begin Atlanta broker outreach** for the validation study (matrix #4 + #8 spine)
7. Reading 3 cutover — `terravalue-standalone/` lifts to its own Vercel project + DNS, when ready

**Deferred to P1 / later:**
- Tax appeal report MVP (gated on validation-study data pipeline)
- Canopy Score widget (#1)
- Stormwater fee credit calculator (#2)

---

## Files to read next session, in order

1. `NEXT-SESSION-KICKOFF.md` — the existing kickoff primer (operational orientation)
2. `SESSION-HANDOFF-2026-05-05.md` — this file (strategic + code state)
3. `VERCEL-DEPLOY-ISSUE.md` — the open Vercel routing issue, with exact diagnostic questions
4. `TerraValue-Positioning-Brief.md` and `TerraValue-Feature-Prioritization.md` — strategic anchors

---

## Working rules (carried forward from prior sessions)

- Ask before starting big work
- Ask where to save files
- Ask permission before sharing William's name or current employer (City of Sandy Springs) in public-facing content — *resolved this session: name + role are now public on terravalue.html founder section*
- Think like William — be an extension of the Soil Principle (work the foundations, not the appearances)
- Always create a copy-pastable terminal command when ready to push (added this session)
