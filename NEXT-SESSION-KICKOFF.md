# Next Session — Kickoff Primer

**Paste this whole file into the first message of a new Cowork chat. It's enough context for Claude to be useful immediately.**

---

I'm William Park (P&X — Phloem & Xylem, the natural-resource consulting practice; founder of TerraValue, the ecosystem-aware AVM). I'm picking up work where the May 5, 2026 session left off.

**Before doing anything, read these files in order:**
1. `Desktop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-05.md` — most recent session state, strategic + code
2. `Desktop/Claude-Work/P&X/VERCEL-DEPLOY-ISSUE.md` — the open Vercel routing issue (top priority)
3. `Desktop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-04.md` — prior session state (API migration + audit)
4. `Desktop/Claude-Work/P&X/CUTOVER-CHECKLIST.md` — operational task waiting in the wings
5. `Desktop/Claude-Work/P&X/TerraValue-Positioning-Brief.md` and `Desktop/Claude-Work/P&X/TerraValue-Feature-Prioritization.md` — strategic anchors

**Quick state summary** (so you don't have to dig):
- Repo: `github.com/willpark1895-spec/px-website` — branch `main`, last 2 commits: `d0d86bd` (AVM-voice body + P&X credit corrected), `fd9b574` (brand split Reading 2)
- Code is clean and pushed. Both pxconsulting.io and the (mis-routed) terravalue page are live in production.
- TerraValue and P&X are now structurally separate marketing surfaces. TerraValue is positioned as an Ecosystem-aware AVM end-to-end.
- P&X is credited as the practice TerraValue was founded out of. William Park founded P&X. No legal entities exist yet — copyright reads `© 2026 P&X (William Park)`.

**Open issue (top priority for this session):**
Vercel is deploying TerraValue edits to `terravalue-z43u.vercel.app` instead of `www.terravalue.app`. The diagnostic checklist is in `VERCEL-DEPLOY-ISSUE.md`. William needs to look at the Vercel dashboard and report back on which project owns the terravalue.app domain before any fix can be applied.

**What's pending after the Vercel fix** (priority order):
1. Run `node tests/e2e-validate.js https://www.terravalue.app` (or whatever the correct URL becomes)
2. Set `TERRAVALUE_API_KEY` env var on Vercel + DNS for pxconsulting.io
3. After 1+ week stable, execute the script-tag cutover per `CUTOVER-CHECKLIST.md`
4. File the patent provisional (matrix #6) — week 1, $3–5K, unblocks every institutional conversation
5. Begin Atlanta broker outreach for the validation study (matrix #4 + #8 spine)
6. Reading 3 cutover when ready — `terravalue-standalone/` lifts to its own Vercel project + DNS

**Strategic posture (sharpened May 5):**
- TerraValue is the company. It is the *Ecosystem-aware AVM*. Everything else exists to support that tool.
- Residential homeowner / broker / tax-appeal surface is a *case-study production layer*, not a primary revenue line. Generates paired-sales data and field testimonials for the institutional validation study.
- Tax appeal demoted to P1. Validation study (#8) and broker design partner (#4) are the strategic spine of the next 90 days. Patent provisional (#6) is the only other true P0.

**Working rules:**
- Ask before starting big work
- Ask where to save files
- Always create a copy-pastable terminal command when ready to push
- Think like me — be an extension of the Soil Principle (work the foundations, not the appearances)

**My ask for this session:** [fill in what you want to focus on, e.g. "Help me diagnose and fix the Vercel deploy routing for terravalue.app" or "Walk me through filing the patent provisional"]
