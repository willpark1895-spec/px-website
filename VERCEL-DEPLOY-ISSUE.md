# Open Issue — Vercel deploy routing for terravalue.app

**Status:** Diagnosis started May 5, 2026. Not resolved. Top priority for next session.

**Symptom:** Pushes to `main` deploy `website/terravalue.html` to `terravalue-z43u.vercel.app` instead of the intended `www.terravalue.app`.

---

## What we know

- Repo `github.com/willpark1895-spec/px-website`, branch `main`, builds from `website/` per `vercel.json`
- `vercel.json` is configured correctly for the px-website project
- The `terravalue-z43u.vercel.app` URL is Vercel's auto-generated preview/project URL — that pattern (random suffix) means the project either has no custom domain attached, or the custom domain isn't pointing at this project

## What we don't know yet

- How many Vercel projects exist on William's account
- Which project (if any) owns the `www.terravalue.app` and apex `terravalue.app` domains
- Whether `terravalue.app` is even attached to a Vercel project, or just sitting at the registrar

---

## Diagnostic checklist for next session

**William needs to open https://vercel.com/dashboard and report back on:**

### 1. Project inventory
- How many projects are listed?
- What are their names?
- Which one is connected to `willpark1895-spec/px-website`?

### 2. Domain ownership
For each project, click Settings → Domains and note:
- What custom domains are attached?
- Specifically: which project (if any) shows `www.terravalue.app` or `terravalue.app`?

### 3. Git connection
For each project, click Settings → Git and note:
- Which Git repo is connected?
- Which branch triggers production deploys?
- Which directory is the project root?

### 4. Latest deploy
Click into the most recent `terravalue-z43u.vercel.app` deployment:
- What URL is shown as the "production" or "primary" domain?
- What files were deployed (check the build output or source)?
- Is `website/terravalue.html` in the build, or something else?

---

## Three diagnoses (most → least likely)

**Diagnosis 1 — Domain attached to wrong project.**
The `www.terravalue.app` domain is configured on a different Vercel project (maybe an early experiment), not the px-website project that's getting your pushes. Your pushes deploy fine, but they deploy to a project that has no custom domain, hence the `terravalue-z43u.vercel.app` URL.

**Fix:** Detach `www.terravalue.app` from the wrong project, attach it to the px-website project. Add a `vercel.json` rewrite so requests to terravalue.app serve `terravalue.html` instead of `index.html`.

**Diagnosis 2 — No project for terravalue.app exists.**
Only one Vercel project exists (px-website), and `terravalue-z43u.vercel.app` is Vercel's auto-generated alias for it. The `terravalue.app` DNS has never been pointed at Vercel, or points somewhere else entirely.

**Fix:** Either attach `www.terravalue.app` to the existing px-website project (with a rewrite to serve terravalue.html at the apex), or create a new Vercel project pointed at `terravalue-standalone/` (Reading 3).

**Diagnosis 3 — DNS misconfigured at registrar.**
The Vercel project is correct, but the A/CNAME records at your domain registrar point at the wrong Vercel endpoint.

**Fix:** Check DNS records at the registrar against Vercel's expected values. Vercel's domain settings page shows the exact records needed.

---

## Recommended fix (Option B): two projects, same repo, different output

Once diagnosed, the recommended sequence:

1. Confirm the px-website project is the only one connected to the GitHub repo and serves `pxconsulting.io` correctly
2. Create or repair a second Vercel project — call it `terravalue-website` — also connected to `willpark1895-spec/px-website`, branch `main`
3. Configure that project's `vercel.json` (or root setting) to serve `website/terravalue.html` as the index, OR point its root at `terravalue-standalone/` and serve that folder
4. Attach `www.terravalue.app` (and apex `terravalue.app` redirecting to www) to that second project
5. Verify DNS at the registrar points at the correct Vercel endpoints

**Why Option B and not full Reading 3 today:** Reading 3 (standalone repo, separate engine deploy, separate API) requires more coordination — kickoff doc says wait for 1+ week of stability after API migration before script-tag cutover. Option B is a smaller change that solves the immediate problem (TerraValue edits land at terravalue.app) and makes Reading 3 a one-step swap when you're ready.

---

## What NOT to do

- **Don't** create a third Vercel project just to host the standalone copy — that turns one source of truth into three. Wait until Reading 3 is the actual goal.
- **Don't** delete the existing project that the `terravalue-z43u` URL belongs to until you've confirmed nothing important is attached to it.
- **Don't** change DNS records before confirming which Vercel project they should point at.

---

## Blocking dependencies

This issue blocks:
- Sharing the new TerraValue page externally with anyone (the `terravalue-z43u` URL is unbrandable)
- Validating that the `Founded out of P&X` hero credit and Integration Surface band render correctly in production (they are, but on the wrong URL)
- Running `node tests/e2e-validate.js` against the canonical TerraValue URL

This issue does NOT block:
- Patent provisional filing
- Atlanta broker outreach
- Internal review of the new copy (you can preview it on `terravalue-z43u.vercel.app` for now)

---

## Quick-reference URLs

- **Repo:** https://github.com/willpark1895-spec/px-website
- **Vercel dashboard:** https://vercel.com/dashboard
- **Current TerraValue deploy (wrong URL):** https://terravalue-z43u.vercel.app/
- **Intended TerraValue deploy:** https://www.terravalue.app/
- **P&X production:** https://pxconsulting.io
