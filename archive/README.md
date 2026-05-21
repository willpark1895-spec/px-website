# P&X Archive

**Last updated:** 2026-05-20

Historical docs from prior sessions. Kept for context, not as live runbooks. Every file in here has a status banner at the top describing why it was archived and what (if anything) supersedes it.

If you came here looking for current state, go back up to `P&X/README.md` — these files are reference-only.

## Layout

- `handoffs/` — dated session handoffs and one-shot handoff docs for specific tasks (CORS proxy, deploy routing, API migration). Each describes the state of the project at the time it was written.
- `audits/` — code and methodology audits. The findings have been worked through; the docs remain as the source of those findings.

## How handoffs relate

The handoffs form a chronological chain:

1. `PX-Session-Handoff.md` (April 27–28) — initial P&X session, Round 2 audit
2. `TerraValue-API-Migration-Handoff.md` (April 29) — API extraction planning
3. `SESSION-HANDOFF-2026-05-04.md` — API migration shipped + phantom-data fixes
4. `SESSION-HANDOFF-2026-05-05.md` — brand split + AVM-voice rewrite; first surfacing of the Vercel deploy routing issue
5. `VERCEL-DEPLOY-ISSUE.md` — diagnosis of that issue (eventually resolved by Reading 3, not by the original plan)
6. `HANDOFF-CORS-PROXY.md` — planned CORS proxy work, **obsoleted** by Reading 3
7. `SESSION-HANDOFF-2026-05-09.md` — value corrections + parcel-data refactor adoption + CORS roadblock
8. `SESSION-HANDOFF-2026-05-10.md` — Reading 3 cutover (the canonical "where we are now" doc; lives at the root, not here)

If the current state and a doc here disagree, **the current state wins**. Archived docs are frozen snapshots.
