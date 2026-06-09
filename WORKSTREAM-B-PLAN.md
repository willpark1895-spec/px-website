# Workstream (b) — Runbook: Dormant Rollback-Anchor Teardown

**Prepared:** 2026-05-31
**Owner:** William Park (executes from his laptop — not the sandbox)
**Prereq reading:** `TerraValue - Session Handoff (2026-05-28 Phase E).md` §3 · `VERCEL-PROJECTS.md`
**Status:** Ready. Recommended execution on/after **~June 2, 2026**. No hard deadline.
**Note:** This file is an untracked planning artifact. Commit it or leave it as you like; it is not part of the teardown commit.

---

## What this does

Completes the hub-and-spoke restructure started 2026-05-26 by retiring the dormant rollback anchor:

1. Delete Vercel **Project 3** (`terravalue`) — dormant, carries no custom domain.
2. Remove `px-website/terravalue-standalone/` (5 tracked files, ~208 KB) in one commit.
3. Sync `VERCEL-PROJECTS.md` so the doc matches reality.

After this, the restructure is complete and TerraValue is in steady state.

**Exact removal target** (`git rm -r terravalue-standalone`):

```
terravalue-standalone/README.md                 4K
terravalue-standalone/index.html               84K
terravalue-standalone/methodology-audit.md     16K
terravalue-standalone/terravalue-engine.js    100K   (stale pre-npm monolith engine)
terravalue-standalone/vercel.json               4K
```

---

## ⚠️ The one irreversible thing — read before starting

Project 3 is the **fast rollback path** for the May 26 Phase C cutover. Per `VERCEL-PROJECTS.md`, undoing Phase C *today* is a ~5-minute Vercel domain swap back to Project 3. **Deleting Project 3 removes that path.** After (b), undoing Phase C would require recreating the Vercel project *and* restoring `terravalue-standalone/` from git history (it stays in the log — recoverable via `git revert`).

That added cost is exactly why the Phase E handoff recommended a **~7-day buffer** (→ ~June 2) of `terravalue.app` running clean on the new architecture first.

Today (May 31) is **day 5 of 7**. Running now is a judgment call: 5 clean days is most of the buffer, but it is 2 days short of the recommendation. If `terravalue.app` has shown any flakiness since May 26 — wait. If it's been solid, proceeding is low-risk: Project 3 carries no domain and nothing live depends on it.

---

## Pre-flight checks (do ALL before Step 1)

- [ ] **terravalue.app is healthy.** `curl -sIL https://terravalue.app/` → 200; `curl -sL https://terravalue.app/terravalue-engine.js | grep -c "Generated:"` → ≥1 (bundle present). This is the thing that must keep working.
- [ ] **Project 3 carries NO domain.** Vercel → project `terravalue` → Settings → Domains → confirm the list is **empty** (`terravalue.app` should sit under `terravaluev2`). If Project 3 still holds `terravalue.app`, **STOP** — the cutover didn't complete; do not delete.
- [ ] **px-website is clean + on main.** `cd ~/Desktop/"Desktop - a laptop"/Claude-Work/px-website && git status` → clean tree, branch `main`, tip `30148db`. *(Couldn't verify cleanliness from the sandbox — a `.git/index.lock` permission quirk blocked it. If you hit an `index.lock` error, `rm -f .git/index.lock` clears a stale lock.)* **Expected untracked files:** `WORKSTREAM-B-PLAN.md` and `WORKSTREAM-B-VERCEL-PROJECTS.patch` are queued planning artifacts — `git status` will list them as untracked. Don't `git add .`; Step 3b stages `VERCEL-PROJECTS.md` explicitly so they stay out of the teardown commit.

---

## Step 1 — Delete Vercel Project 3 (browser)

1. https://vercel.com/dashboard → open project **`terravalue`** (NOT `terravaluev2`, NOT `pxconsulting.io`).
2. **Confirm it's the right one:** Settings → General → **Root Directory** reads `terravalue-standalone`. (That's what distinguishes it from Project 1, which shares the same `px-website` repo.)
3. Settings → General → bottom of page → **Delete Project** → confirm.

---

## Step 2 — Confirm it's gone

- `curl -sIL https://terravalue-willpark1895-specs-projects.vercel.app/` → expect 404 / "project not found" (allow ~60s).
- `curl -sIL https://terravalue.app/` → still **200** (sanity: deleting Project 3 didn't touch the live domain).

---

## Step 3 — Remove the folder + sync the doc (laptop)

**3a. Apply the `VERCEL-PROJECTS.md` patch.** Drafted + verified 2026-05-31 — applies cleanly to tip `30148db` (`git apply --check` passed). From the repo root:

```
git apply WORKSTREAM-B-VERCEL-PROJECTS.patch
```

What it changes: removes the Project 3 section, its env-var block, and its source-of-truth-diagram entry; flips "three live projects" → "two"; fixes the Project 2 naming aside and the sanity-check note that referenced Project 3; rewrites the Rollback procedure to reflect that the fast domain-swap is gone; marks Pending cleanup complete. Prefer I apply it live, or regenerate it against a newer tip? Ask at execution time.

Left untouched on purpose (pre-existing drift, NOT part of (b)): the doc still shows old `P&X/` paths and engine `1.0.1` in a couple of spots. Say the word for a separate sync patch.

**3b. Run the git steps.** Each line is a single paste-safe command — copy whole lines:

```
cd ~/Desktop/"Desktop - a laptop"/Claude-Work/px-website
git rm -r terravalue-standalone
git add VERCEL-PROJECTS.md
git commit -m "Remove terravalue-standalone and retire dormant rollback anchor (workstream b)"
git push origin main
```

Note: this commit also triggers a redeploy of **Project 1 (pxconsulting.io)** since it shares the repo — harmless; removing `terravalue-standalone/` doesn't touch `website/` or `api/`.

---

## Step 4 — Post-teardown verification

- [ ] `curl -sIL https://terravalue.app/` → 200; load the page and run one sample valuation in the calculator.
- [ ] `curl -sIL https://pxconsulting.io/` → 200; `curl -sIL https://pxconsulting.io/terravalue` → still redirects (301) to terravalue.app.
- [ ] `curl -s https://pxconsulting.io/api/health` → 200.
- [ ] `git -C ~/Desktop/"Desktop - a laptop"/Claude-Work/px-website log --oneline -1` shows the removal commit; tree clean.

---

## Step 5 — Close out

- [ ] Write a short handoff / archive entry: (b) shipped, hub-and-spoke restructure complete, TerraValue in steady state.
- [ ] *Optional janitorial surfaced by the 2026-05-31 bloat audit — separate from (b):* archive `Outputs/validate-f2.mjs` (planned archive entry 004); file the 6 stray personal docs at `Claude-Work` root into `About Me/` and `Projects/`.

---

## Rollback / abort

- **Before Step 1:** abort costs nothing.
- **After Step 1, before Step 3:** Project 3 is gone, folder still present. To restore the fast rollback path, recreate a Vercel project from `px-website` with Root Directory `terravalue-standalone`. (Pre-flight verifies terravalue.app health precisely so this is never needed.)
- **After the Step 3 push:** `git revert <commit>` restores `terravalue-standalone/`; recreate Project 3 in Vercel only if the rollback anchor is actually required. `terravalue.app` lives in a *different* repo and is untouched by this commit — so any problem there is not caused by (b).
