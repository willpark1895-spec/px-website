# TerraValue Frontend Cutover Checklist

**When:** After 1+ week of stable API operation on Vercel with zero errors in logs.

**Pre-cutover validation:**
1. Run `node tests/e2e-validate.js https://your-project.vercel.app` — all 23 checks must pass
2. Check Vercel function logs for any 500 errors in the past 7 days
3. Verify both index.html and terravalue.html work correctly with API calls (not fallback)

## Changes to Make

### 1. `website/index.html`

**Remove** line 993:
```html
<script src="terravalue-engine.js"></script>
```

**Remove** the `runDemoLocal()` function (the fallback that references `TerraValueEngine`).

**Remove** the `catch` block's call to `runDemoLocal(d)` — replace with a user-facing error message or silent no-op.

### 2. `website/terravalue.html`

**Remove** line 814:
```html
<script src="terravalue-engine.js"></script>
```

**Remove** all `typeof TerraValueEngine !== 'undefined'` fallback branches in:
- `getEcoRates()` — remove the fallback to `TerraValueEngine.ECOSYSTEM_SERVICE_RATES`
- `_runProjector()` catch block — remove the `TerraValueEngine.LandAppreciation.project()` fallback
- Land valuation button catch block — remove the `TerraValueEngine.LandValuation.fullValuation()` fallback

**Replace** fallback code with user-facing error messages (e.g., "Calculation service temporarily unavailable. Please try again.").

### 3. Optional cleanup

- `website/terravalue-engine.js` can be archived or deleted once both pages are cutover
- The file is ~155 KB and will no longer be loaded by any page

## Rollback

If issues arise after cutover, re-add the script tags. The fallback code can be restored from git history.
