# TerraValue Engine — Full Audit Report

**Date:** April 28, 2026  
**Scope:** `terravalue-engine.js` (v1.0), `terravalue.html`, `index.html`  
**Purpose:** Verify that every customer-facing number is traceable, replicable, and free of fabricated data. Identify any "daydreaming" — values presented as fact without a derivable chain from source to output.

---

## Verdict Summary

The engine is well-structured and substantially sound. The previous audit session corrected the most egregious issues (hardcoded bar values, stale demo numbers, missing synthetic flags). What remains are **10 specific findings** — none catastrophic, but several must be addressed before this can credibly claim "new industry standard" status.

| Category | Clean | Flagged |
|----------|-------|---------|
| Ecosystem service rates (6 services) | 4 fully traceable | 2 have traceability gaps |
| Land valuation constants | Methodology sound | Several "estimated range" constants need disclosure |
| Customer-facing HTML | Demo data properly gated | 2 gaps in disclaimer surfacing |
| Calculation logic | Core math verified | 3 methodology questions (ask before changing) |

---

## Section 1: Ecosystem Service Rate Audit

### CLEAN — Fully Traceable

| Rate | Value | Derivation Chain | Verdict |
|------|-------|------------------|---------|
| Carbon | $494/canopy-acre/yr | 2.6 t CO₂ × $190/t = $494. Source: Atlanta iTree Eco 2014 (sequestration rate) + EPA SC-GHG 2023 Table ES-1 (social cost, 2% near-term) | Traceable, math checks out |
| Energy | $252/canopy-acre/yr | 1,800 kWh × $0.14/kWh = $252. Source: McPherson 2003 (kWh) + GA Power residential avg rate | Traceable, math checks out |
| Air Quality | $418/canopy-acre/yr | Cited as total pollutant removal value from Nowak et al. 2014, weighted by BenMAP-CE. PM2.5 at $117,106/ton. | Traceable to named source |
| Property Premium | ~7% of MV | Kovacs et al. 2022 meta-analysis, capped at 12%, scaled linearly to 30% optimal canopy per Siriwardena/Netusil | Traceable, cap is empirically grounded |

### FLAGGED — Traceability Gaps

**Finding 1: Stormwater — $520/canopy-acre/yr**

The rate is attributed to "benefit transfer from USDA CUFR / iTree Eco literature" but no specific study, table, or calculation chain is given. "Benefit transfer" is a legitimate valuation technique, but for an industry-standard tool, the intermediate steps need to be documented: which iTree output, which CUFR publication, what year, what geography.

- **Risk:** A reviewer could not independently replicate this number from the cited sources alone.
- **Recommendation:** Pin this to a specific iTree Eco run output or CUFR technical report with page/table reference. If this was derived from a multi-city average, state that.

**Finding 2: Habitat — $320/canopy-acre/yr**

Cited as "Troy & Wilson 2006; Brander & Koetse 2011 (approximate, benefit transfer)." The word "approximate" is already in the source attribution, which is good transparency. However, Troy & Wilson 2006 is an ecosystem services mapping paper — the $320 figure's derivation path from that paper is not specified.

- **Risk:** Same as stormwater — not independently replicable from citation alone.
- **Recommendation:** Either provide the WTP transfer calculation chain, or label this as "P&X estimated range based on benefit transfer literature" rather than implying a precise figure.

---

## Section 2: Land Valuation Constants Audit

### "Estimated Range" Constants — Honest but Need Customer Disclosure

The engine uses these constants throughout the `LAND_VALUATION_CONSTANTS` object. Critically, the source fields already say "Estimated range based on..." which is honest internally. However, **the customer-facing UI does not surface these qualifications.**

| Constant | Source Field | Issue |
|----------|-------------|-------|
| Cap rates (all 7 property types) | "Estimated range based on CBRE/JLL survey data" | Not direct from a specific survey table |
| Construction costs (3 types) | "Estimated range based on RS Means Southeast benchmarks" | Not from a specific RS Means edition/page |
| Appreciation rates (Atlanta/national) | "FHFA HPI Atlanta metro (approximate long-term averages)" | "Approximate" — no vintage year specified |

These are reasonable professional estimates, not fabrications. But for industry-standard status, each should either:

1. Cite the specific survey edition, date range, and table (e.g., "CBRE H2 2024 Cap Rate Survey, Exhibit 3, Atlanta metro"), or
2. Be explicitly labeled as "P&X professional estimates informed by [source]" in the customer-facing output.

### Hardcoded Assumptions in Calculation Logic

| Location | Value | Context | Risk |
|----------|-------|---------|------|
| `_estimateUseFeasibility()` | Revenue/cost per sqft by use type (e.g., residential: $200 rev, $175 cost) | HBU residual land value | These are rough planning-level estimates with no source citation |
| `LandAppreciation.project()` | `lotSizeSqFt: 15000` default | Used when lot size not provided | Reasonable default but should be disclosed |
| `LandAppreciation.project()` | `1 score pt ≈ 0.5% canopy` | Core conversion factor | No peer-reviewed source — this is a P&X model assumption |
| `costApproach()` | `lotSizeSqFt * 5` fallback ($5/sqft) | When no land value or assessment available | Arbitrary fallback — could produce misleading results |
| `incomeCapitalization()` | `0.065` GRM estimate | When no real GPI provided | Reasonable estimate but unlabeled in output |
| `highestAndBestUse()` | `0.05` capitalization rate for ecosystem services | Capitalizing annual ecosystem value | No source for this specific cap rate choice |

**Finding 3:** The `_estimateUseFeasibility()` helper uses completely unsourced revenue and cost estimates ($200/sqft residential revenue, $175/sqft cost, etc.). These drive the HBU "financially feasible" determination. A customer could take the HBU recommendation at face value without knowing the inputs are generic planning estimates.

**Finding 4:** The `1 score point ≈ 0.5% canopy` conversion is the backbone of the LandAppreciation projector. It's presented as methodology but has no peer-reviewed derivation. This is a P&X model choice, which is fine — but it needs to be explicitly labeled as such, not implied to be research-backed.

---

## Section 3: Customer-Facing HTML Audit

### terravalue.html — Value Projector

**Finding 5: Projector hardcodes `lotSizeSqFt: 15000`** (line 848). The user adjusts home value via slider, current/projected scores, and timeline — but lot size is fixed. Since ecosystem service values scale linearly with lot size × canopy, this silently assumes a ~0.34 acre lot for every property. A $2M home on 5 acres and a $200K home on 0.1 acres get the same ecosystem service delta.

- **Impact:** Ecosystem value projections could be significantly wrong for properties that differ from this assumption.
- **Recommendation:** Either add a lot size input to the projector, or display a disclaimer: "Ecosystem projections assume a 15,000 sqft lot. Actual values scale with lot size."

**Finding 6: Land Valuation tool runs without disclaimer badge.** The engine returns a `dataQuality` object with `syntheticDataUsed`, `warnings[]`, etc. But `terravalue.html` never reads or displays these flags. The valuation runs with synthetic comps and estimated GPI by default, and the customer sees a reconciled value, approach weights, and HBU recommendation — all presented without any indication that the underlying data is synthetic.

- **Impact:** A customer could screenshot this output and present it as a real valuation estimate. The engine has the flags; the UI ignores them.
- **Recommendation:** Add a visible disclaimer banner in `lv-results` when `report.dataQuality.syntheticDataUsed === true`. Something like: "This valuation uses estimated data for demonstration. Provide real comparables and income data for market-grade analysis."

### index.html — Homepage Demo

**Finding 7: Demo addresses use real property data without disclosure.** The three demo addresses (7840 Roswell Rd, 1578 Mount Vernon, 4700 North River) appear to reference real properties with specific lot sizes, canopy percentages, and assessed values. No disclaimer indicates these are approximations or demo data.

- **Impact:** If a homeowner at one of these addresses runs the demo, they'll see numbers that appear to be an analysis of their property but are actually hardcoded approximations.
- **Recommendation:** Add small print: "Demo values are approximations for illustration. Full analysis available in the TerraValue app."

### Both Files — What's Clean

- Unknown addresses in index.html correctly show dashes and "Try the full app for any address" — no fake data generated. This is good.
- Projector bar values in terravalue.html compute dynamically from engine constants at runtime — no stale hardcoded values remain.
- Home value slider feeds into all calculations correctly. Score-to-canopy-to-value pipeline is mathematically consistent.
- Ecosystem service cards reference rates from `ECOSYSTEM_SERVICE_RATES`, not hardcoded values.

---

## Section 4: Methodology Questions (Ask Before Changing)

These are not bugs or fabrications — they're design choices I want to flag for your decision.

### Question A: Linear canopy-to-premium scaling below 30%

The engine scales the 7% property premium linearly: `premiumPct × (canopyPct / 30)`. So 15% canopy = 3.5% premium, 7.5% canopy = 1.75% premium. Netusil et al. 2014 found 0.17% per 1% canopy in a 500m buffer, which would give a different curve shape (0.17% × 15 = 2.55% at 15% canopy, not 3.5%). The two models diverge below 30%.

**Should the sub-30% premium use Netusil's marginal rate (0.17% per 1%) instead of linear interpolation from Kovacs's 7% at 30%?** The `_canopyValueCurve()` method in LandAppreciation already uses Netusil's marginal rate correctly — but `EcosystemServices.calculate()` uses the linear Kovacs scaling. This creates an internal inconsistency between the two modules.

### Question B: Maintenance estimates lack source rigor

`SUSTAINABILITY_METRICS.maintenance` includes:
- 15% stormwater infrastructure reduction
- 20% pavement life extension
- $85/acre/yr erosion control

The code already includes a note: "Maintenance estimates are approximate ranges based on industry benchmarks, not from specific studies." This is honest. But the customer-facing output includes these in the total sustainability value without flagging them separately.

**Should maintenance savings be broken out with an "(estimated)" label in the UI, or are you comfortable with the existing internal note?**

### Question C: Ecosystem service capitalization at 5%

In `highestAndBestUse()`, annual ecosystem service value is capitalized at 5% (`ecosystemAnnualValue / 0.05`). This discount rate significantly affects the capitalized value — at $2,004/yr for one canopy-acre, that's $40,080 capitalized. At 3% it would be $66,800; at 8% it would be $25,050. The 5% rate is not sourced.

**Is 5% an intentional choice based on your professional judgment, or should this be tied to a specific discount rate benchmark?** If professional judgment, it should be documented as such.

---

## Section 5: Synthetic Data Flagging — What Works

The engine's data quality system (added in the previous session) is well-designed:

- `_generateSyntheticComps()` correctly sets `isSynthetic: true` on every comp
- `salesComparison()` returns `usingSyntheticComps`, `confidence: 'demo'`, and `syntheticDisclaimer`
- `incomeCapitalization()` returns `incomeEstimated` and `incomeDisclaimer` when GPI is auto-derived
- `fullValuation()` returns a top-level `dataQuality` object with `hasRealComparables`, `hasRealIncome`, `syntheticDataUsed`, and `warnings[]`
- When real comps and real income are provided, all flags are clean — no false positives

**The engine side is audit-ready. The gap is purely on the UI side (Finding 6).**

---

## Action Items Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | Stormwater $520 — no derivation chain | Medium | Pin to specific iTree/CUFR publication |
| 2 | Habitat $320 — "approximate" benefit transfer | Medium | Provide transfer calculation or label as estimate |
| 3 | HBU feasibility uses unsourced revenue/cost estimates | Medium | Add source or label as "planning-level estimates" |
| 4 | Score-to-canopy conversion (0.5%) is unsourced | Medium | Label as "P&X model assumption" in methodology |
| 5 | Projector hardcodes 15,000 sqft lot | Medium | Add input or disclaimer |
| 6 | Land valuation UI ignores dataQuality flags | High | Surface `syntheticDataUsed` disclaimer in UI |
| 7 | Demo addresses use real-property approximations | Low | Add "demo approximation" small print |
| 8 | Cap rates / construction costs need specific citations | Low | Upgrade "estimated range" to specific edition/table, or disclose |
| 9 | Internal inconsistency: two premium models below 30% | Low | Decision needed (Question A) |
| 10 | Ecosystem capitalization rate (5%) unsourced | Low | Document as professional judgment or cite benchmark |

---

## What's Ready for Industry Standard

The following aspects are solid and defensible:

- Carbon sequestration: fully traceable EPA × iTree chain
- Energy savings: fully traceable McPherson × GA Power chain
- Air quality: traceable to Nowak et al. + BenMAP-CE
- Property premium model: three peer-reviewed sources with diminishing returns curve
- Three-approach land valuation: structurally sound USPAP framework
- Synthetic data flagging: comprehensive engine-side system
- Canopy value curve: properly implements Cho et al. diminishing returns
- Certification pathways: real credit structures from LEED/BREEAM/WELL/Green Globes
- GA assessment ratio: correctly coded per O.C.G.A. § 48-5-7
- Disclaimers in methodology export: honest about limitations

**Bottom line:** Fix Findings 5 and 6 (UI-level), resolve Findings 1-4 (traceability), and this engine is significantly ahead of anything else in the market for parcel-level ecosystem service valuation.
