# Next Session — Kickoff Primer

**Paste this whole file into the first message of a new Cowork chat. It's enough context for Claude to be useful immediately.**

---

I'm William Park (P&X — Phloem & Xylem, the natural-resource consulting practice). I'm picking up TerraValue work where the May 4, 2026 session left off.

**Before doing anything, read these files in order:**
1. `Desktop/Claude-Work/P&X/SESSION-HANDOFF-2026-05-04.md` — full state of the project
2. `Desktop/Claude-Work/P&X/CUTOVER-CHECKLIST.md` — the operational task waiting in the wings
3. `Desktop/Claude-Work/P&X/AUDIT-2026-05-04.md` — the 5 phantom-data findings (all fixed, but the doc explains why each fix exists)

**Quick state summary** (so you don't have to dig):
- Repo: `github.com/willpark1895-spec/px-website` — branch `main`, last 3 commits: `0ba5fc7` (gitignore), `235e7a5` (audit doc), `66225b5` (API migration).
- The 2,345-line monolithic engine has been decomposed into `lib/` + `config/` + `api/`, with 26/26 golden parity tests passing.
- Frontend is API-first with local-engine fallback. Both pages verified working on the live Vercel deploy.
- All 5 phantom-data findings from the audit were fixed inline in commit `66225b5`. The math didn't change; what changed is that confidence labels are now derived from inputs and synthesized inputs are disclosed in `dataQuality.assumptionsApplied[]`.

**What's pending** (in approximate priority order):
- Run `node tests/e2e-validate.js https://YOUR-VERCEL-URL.vercel.app` to validate the live deploy
- Set `TERRAVALUE_API_KEY` env var on Vercel + point `pxconsulting.io` DNS at Vercel
- After 1+ week stable, execute the script-tag cutover per `CUTOVER-CHECKLIST.md`
- Decide on next feature from `TerraValue-Feature-Prioritization.md` or first marketing push from `TerraValue-Positioning-Brief.md`

**Working rules:**
- Ask before starting big work.
- Ask where to save files.
- Ask permission before sharing my name or current employer (City of Sandy Springs) in public-facing content.
- Think like me — be an extension of the Soil Principle (work the foundations, not the appearances).

**My ask for this session:** [fill in what you want to focus on, e.g. "Run e2e-validate against the live URL and walk me through the results" or "Help me decide which feature to build next"]
