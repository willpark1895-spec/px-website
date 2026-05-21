# TerraValue Frontend Cutover Checklist — CLOSED

**Last updated:** 2026-05-20
**Status:** Closed. All actions complete.

This runbook described the post-API-migration cleanup of the original monolithic `terravalue-engine.js`. As of May 20, 2026 there is nothing left to do here. Kept at root (not archived) because it's referenced from older handoffs as a known-open task — anyone who lands here should know it's done.

---

## What this checklist covered

After the May 4 API migration, the pxconsulting.io frontend was wired API-first with a local-engine fallback via `<script src="terravalue-engine.js">`. The plan was to wait 1+ week for stable API logs, then remove the script-tag fallback and delete the 2,345-line monolith.

## Completion record

| Action | Status | Notes |
|---|---|---|
| Remove `<script src="terravalue-engine.js">` from `website/index.html` | ✅ Done (in a prior commit; date not recorded — confirmed by grep on 2026-05-20) | `website/index.html` has zero references to `terravalue-engine.js` or `TerraValueEngine`. |
| Remove `<script src="terravalue-engine.js">` from `website/terravalue.html` | ✅ N/A (file deleted 2026-05-20) | The file was deleted as part of the duplication cleanup. `pxconsulting.io/terravalue` and `/terravalue.html` now 301-redirect to https://www.terravalue.app. |
| Delete `website/terravalue-engine.js` | ✅ Done 2026-05-20 | 2,345 lines / ~155 KB removed. No remaining consumers in `website/`. |
| 1-week API stability window | ✅ Closed 2026-05-11 | No incidents during the window. |

---

## What was NOT touched

`terravalue-standalone/terravalue-engine.js` is **still in place** and is intentionally kept as a client-side fallback for `www.terravalue.app`. Because terravalue.app fetches the API cross-origin from `pxconsulting.io`, a bundled fallback is defensible — it keeps the page functional if the cross-origin call fails. This is by design, not an oversight.

If you ever decide to remove that fallback too, the work is:

1. Remove the `<script src="terravalue-engine.js">` tag from `terravalue-standalone/index.html` (line ~1011).
2. Remove the three `typeof TerraValueEngine !== 'undefined'` branches around lines 1054, 1060, 1167, 1284.
3. Replace each with a user-facing error message.
4. Delete `terravalue-standalone/terravalue-engine.js`.

Don't do this casually — it removes terravalue.app's last line of defense against an API outage.

---

## Rollback (for historical reference)

If issues had arisen after the cutover, the script tag and fallback code could have been restored from Git history. No rollback was needed.
