> **STATUS: Archived 2026-05-20.** This is the April 27–28, 2026 handoff. Superseded by every later SESSION-HANDOFF-* doc; the most recent is SESSION-HANDOFF-2026-05-10.md. Kept for historical context only.

---

# P&X — Session Handoff
**Date:** April 27–28, 2026 (updated April 28, post-code-audit)
**Purpose:** Drop this file (along with the `P&X/` project folder) into a new Cowork session so Claude can pick up exactly where we left off.

---

## What Happened This Session (April 28 — Code Audit & Cleanup)

### Round 2 Audit — Demo Value Contamination & Code Cleanup

A full code audit was performed across all P&X and TerraValue files, focused on ensuring demo values don't contaminate real-time calculations, plus general cleanup.

**1. Projector Bar Values — FIXED (terravalue.html)**
- Old: Hardcoded stale `base` values (`carbon: 663`, `energy: 350`, `prop: 2576`) in the Value Projector bar chart
- New: All bar values computed dynamically from `TerraValueEngine.ECOSYSTEM_SERVICE_RATES` at runtime
- Bar max scales corrected — non-property bars scale to 300, property scales to 12% of home value (the cap)
- The `$2,576/yr` default label in HTML replaced with `—` (JS overwrites on load)

**2. Synthetic Comparable Flagging — ADDED (terravalue-engine.js)**
- `_generateSyntheticComps()` now adds `isSynthetic: true` to each generated comp
- `isSynthetic` propagates through to `adjustedComparables` in the output
- `salesComparison()` returns `usingSyntheticComps: true`, `confidence: 'demo'`, and a `syntheticDisclaimer` when no real comps are provided
- `fullValuation()` returns a top-level `dataQuality` object:
  ```json
  {
    "hasRealComparables": false,
    "hasRealIncome": false,
    "syntheticDataUsed": true,
    "warnings": [
      "Sales Comparison uses synthetic comparables — not real transactions",
      "Income approach uses estimated GPI (6.5% of market value) — not actual rental data"
    ]
  }
  ```
- Income capitalization gets `incomeEstimated: true` and `incomeDisclaimer` when GPI is auto-derived
- When real comps and real income are provided, all flags are clean — no false positives

**3. Index.html TerraValue Demo — FIXED**
- Old: Static hardcoded values (`$4,580`, `$145,410`, `$2,576` property) that never updated
- New: HTML defaults are `—` dashes; `runDemo()` runs on page load and fills with engine-calculated values
- Unknown addresses show "Try the full app for any address" instead of random fake data
- Per-service elements now have stable IDs (`sv-carbon`, `sv-storm`, etc.) instead of relying on `querySelectorAll` index order

**4. Projector Home Value — NOW EDITABLE (terravalue.html)**
- Old: Hardcoded `var home = 450000` with static `$450,000` display
- New: Range slider (`$100K–$2M`, step $10K) that feeds into all projector calculations
- `homeVal` display updates dynamically as slider moves

**5. Formspree Placeholders — REPLACED WITH MAILTO (index.html)**
- Old: `action="https://formspree.io/f/YOUR_FORM_ID"` on both forms (silently 404'd on submit)
- New: Both forms replaced with `mailto:hello@pxconsulting.io` links with pre-filled subject/body
- Dead `emailInput`/`replyTo` sync JS removed

**6. Git Junk Files — IDENTIFIED**
- 7 `tmp_obj_*` files and `maintenance.lock` in `.git/objects/` need local removal (sandbox is read-only for `.git`)

### Previous Changes (carried forward from earlier sessions)

**Values Audit (12+ corrections)** — All ecosystem service rates verified against sources: carbon $494 (was $663), energy $252 (was $350), PM2.5 $117,106/ton, EPA SC-GHG $190/tonne. Property premium capped at 12%. Donovan asthma claim removed. Netusil citation year corrected to 2014. Maintenance costs marked as estimated.

**Removed Reggie Hero Images** — Single-column centered hero, footer memorial preserved

**Soil Score → Coming Soon** — `calculateSoilScore()` returns null, all UI shows "Coming Soon"

**Premium Consultant Connection** — Paywall-gated section on both pages, mailto modal

**Land Valuation Tool** — ~1,000 lines: Sales Comparison, Income Cap, Cost Approach, HBU, Three-Approach Reconciliation

---

## Corrected Value Reference Table

| Service | Rate/acre/yr | Derivation | Source |
|---|---|---|---|
| Carbon Sequestration | $494 | 2.6 t CO2 × $190/t | Atlanta iTree Eco 2014; EPA SC-GHG 2023 Table ES-1 |
| Stormwater Management | $520 | Benefit transfer | USDA CUFR / iTree Eco literature |
| Air Quality | $418 | Total pollutant removal | Nowak et al. 2014; BenMAP-CE ($117K/t PM2.5) |
| Energy Savings | $252 | 1,800 kWh × $0.14/kWh | McPherson 2003; GA Power avg rate |
| Habitat Value | $320 | WTP benefit transfer | Troy & Wilson 2006 (approximate) |
| **Total non-property** | **$2,004** | | |
| Property Premium | ~7% of MV | Capped at 12% | Kovacs 2022; Netusil 2014 |

---

## Known Issues & Pending Items

### Must Do Before Push
- **Remove git junk files** — Run locally:
  ```bash
  cd ~/Desktop/Claude-Work/"P&X"
  rm -f .git/objects/*/tmp_obj_* .git/objects/maintenance.lock .git/index.lock
  git add website/ PX-Session-Handoff.md
  git commit -m "Audit cleanup: dynamic projector values, synthetic comp flagging, mailto forms, dead code removal"
  git push
  ```

### Still Pending
- **Domain `pxconsulting.io`** — Needs DNS records pointed to Vercel
- **Formspree upgrade** — Current forms use mailto fallback. When ready, create a Formspree account and replace the mailto links with real form endpoints for a better UX

### Future Considerations
- **Integrate engine into TerraValue app** — Import `terravalue-engine.js` into `TerraValue.jsx`
- **Real Reggie illustration** — Current SVG line icon works; professional illustration would be stronger
- **Pluggable API connections** — Redfin, Zillow, CoreLogic interfaces ready
- **Expand TerraValue** — 50 GA jurisdictions (currently 10)
- **Blog/content section** — Case studies for SEO
- **Open Graph images** — Social sharing
- **Soil Score implementation** — Needs SSURGO, NLCD, PAD-US, municipal GI registry data sources

---

## File Manifest

### P&X/ folder
| File | What It Is |
|---|---|
| **PX-Session-Handoff.md** | This file |
| **PX-Partner-Overview.pdf** | 1-page client-facing partner overview |
| **PX-Business-Plan.pdf** | 20-page business plan (April 2026) |
| **vercel.json** | Deployment config with security headers |
| **website/index.html** | P&X homepage (~1,085 lines) |
| **website/terravalue.html** | TerraValue product page (~996 lines) |
| **website/terravalue-engine.js** | TerraValue calculation engine — 7 modules, ~2,345 lines |
| **website/sitemap.xml** | 2 URLs |

### Related files elsewhere in workspace
| File | Location |
|---|---|
| **TerraValue app** | `Claude-Work/terravalue/` (full Vite + React project) |
| **TerraValue handoff** | `Claude-Work/TerraValue - Session Handoff.md` |

---

## Key Research & Sources Used in Engine (Verified)

| Source | Used For | Status |
|---|---|---|
| Netusil et al. 2014 (DOI: 10.1016/j.ecolecon.2016.04.018) | 0.17% property value per 1% canopy | ✓ Verified |
| Kovacs et al. 2022 (DOI: 10.1016/j.ecolecon.2022.107424) | ~7% mature canopy premium | ✓ Verified |
| Cho et al. 2020 (DOI: 10.3390/su12104331) | Diminishing returns above 40% canopy | ✓ Verified |
| EPA SC-GHG 2023 (Table ES-1) | $190/tonne CO2 (2% near-term) | ✓ Corrected from $255 |
| Atlanta iTree Eco 2014 | 2.6 t CO2/canopy-acre/yr | ✓ Verified |
| McPherson 2003 | 1,800 kWh/acre/yr cooling savings | ✓ Verified |
| Nowak et al. 2014 | Air quality pollutant removal rates | ✓ Verified |
| Troy & Wilson 2006 | Habitat WTP valuation | ✓ Approximate/benefit transfer |
| FHFA HPI | 3.5% baseline annual appreciation | ✓ Labeled as long-term avg |
| O.C.G.A. § 48-5-7 | Georgia 40% assessment ratio | ✓ Verified |
| USGBC / BRE / IWBI / GBI | Certification credit structures | ✓ Verified |

---

## Engine Data Quality System (New)

The engine now distinguishes real data from demo/synthetic data at every level:

| Flag | Location | Meaning |
|---|---|---|
| `isSynthetic: true` | Each comparable in `adjustedComparables[]` | This comp was generated, not a real transaction |
| `usingSyntheticComps` | `salesComparison()` return | The entire sales comparison used synthetic data |
| `confidence: 'demo'` | `salesComparison()` return | Confidence level is demo-grade, not market-grade |
| `syntheticDisclaimer` | `salesComparison()` return | Human-readable warning string |
| `incomeEstimated` | `incomeCapitalization()` return | GPI was derived from market value, not real rental data |
| `dataQuality` | `fullValuation()` return | Top-level object with `hasRealComparables`, `hasRealIncome`, `syntheticDataUsed`, `warnings[]` |

Any UI consuming engine output can check `dataQuality.syntheticDataUsed` to decide whether to show a disclaimer badge.

---

## About the Founder (for Claude's context)

The founder runs a natural resource consulting firm (P&X — Phloem & Xylem) as a part-time consultancy. Two-tier LLC (Wyoming holding + Georgia operating). ISA Certified Arborist, Urban Forest Specialist, TRAQ. ISA Credentialing Council member. GA Arborist Association Board. B.Sc. Environmental Science. Pursuing Georgia Tech MSPP (Environmental Policy) starting Spring 2027.

**The Soil Principle:** What's visible above ground depends entirely on what's happening below it. Work on root causes, not symptoms.

**Sir Reginald Woofington III (Reggie):** Apricot/red goldendoodle. The P&X mascot. He passed away and lives on through the site. Chief Soil Inspector.

**Working rules:** Ask before starting. Ask where to save files. Ask for permission to share information. Think like him — be an extension of his philosophy, not a replacement for it. Do not include personal name or current employer in any public-facing content.

---

**To continue in a new session:** Share this handoff file + the `P&X/` folder. For TerraValue app work, also include the `terravalue/` folder and its handoff doc.
