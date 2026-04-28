# P&X — Session Handoff
**Date:** April 27–28, 2026 (updated April 28, post-audit)
**Purpose:** Drop this file (along with the `P&X/` project folder) into a new Cowork session so Claude can pick up exactly where we left off.

---

## What Happened This Session (April 28 — Audit & Corrections)

### Audit Completed — All Values Verified & Corrected

A full audit was performed across all P&X and TerraValue files. Every value in the engine was checked against its cited source. 12+ issues were identified and corrected:

**1. Carbon Sequestration Rate — CORRECTED**
- EPA SC-GHG 2023 social cost: $255 → **$190/tonne** (Table ES-1, 2% near-term discount rate, 2024$)
- Rate per canopy acre: $663 → **$494** (2.6 t × $190)
- The $255 figure was the 2020 interim value; the 2023 report's Table ES-1 central estimate at 2% near-term is $190

**2. Energy Savings Rate — CORRECTED**
- Rate per canopy acre: $350 → **$252** (1,800 kWh × $0.14/kWh = $252)
- Previous value had no derivation that matched 1800 × 0.14

**3. Air Quality PM2.5 Value — CORRECTED**
- pm25ValuePerTon: $142,000 → **$117,106** (BenMAP-CE national median)
- Clarified the $418/yr rate is total pollutant removal, not just PM2.5
- Rate per canopy acre $418 unchanged (derived from Nowak et al. 2014 total removal rates)

**4. Stormwater Methodology — CORRECTED**
- Old: "35% rainfall interception × $4.00/1,000 gal" (math gave $1,901, not $520)
- New: "Benefit transfer from USDA CUFR / iTree Eco literature" ($520 retained as literature value)

**5. Habitat Source — SOFTENED**
- Source now reads "benefit transfer from ecosystem services literature" (Troy & Wilson 2006, approximate)

**6. Property Premium Formula — CAPPED**
- Added `Math.min()` cap: premium cannot exceed 12% of market value (CANOPY_VALUE_COEFFICIENTS.maxPremiumPct)
- Previously uncapped: 80% canopy → 19% premium (unrealistic)

**7. Donovan et al. 2013 Asthma Claim — REMOVED**
- Donovan 2013 studied tree canopy and lower-body skin cancer, NOT asthma
- Removed `asthmaReductionPct: 0.029` from SUSTAINABILITY_METRICS
- Removed asthma calculation from SustainabilityValue class
- All Donovan references removed from methodology and reference lists
- Health benefits now cite only Nowak et al. 2014 (air quality via pollutant removal)

**8. Netusil Citation Year — CORRECTED THROUGHOUT**
- "Netusil et al. 2022" → **"Netusil et al. 2014"** everywhere
- Actual paper: Netusil, Siriwardena et al. 2014, published in Ecological Economics 2016, Vol 128
- DOI: 10.1016/j.ecolecon.2016.04.018

**9. Ecosystem Service Rate Sum — CORRECTED**
- LandAppreciation ecoServiceRate: 663+520+418+350+320 → **494+520+418+252+320 = 2,004**
- LandValuation annualServicesPerCanopyAcre: 2,271 → **2,004**

**10. FHFA HPI Label — CORRECTED**
- "2019-2024 average" → **"long-term Atlanta metro average"** (no specific date range claimed)

**11. Maintenance Costs — MARKED AS ESTIMATED**
- stormwaterInfraReduction, pavementLifeExtension, erosionControlValue all marked "(estimated)"
- Added note: "approximate ranges based on industry benchmarks, not from specific studies"

**12. Cap Rates & Construction Costs — MARKED AS ESTIMATED**
- Source strings changed from "CBRE Cap Rate Survey 2024" / "RS Means 2024 Southeast" to "Estimated range based on..." 
- Values are reasonable ranges but not pulled from specific 2024 reports

**13. HTML Files Updated**
- index.html: All static service values updated ($494 carbon, $252 energy), citation pills corrected ($190/tonne), metrics strip updated
- terravalue.html: All 6 service cards corrected, citation descriptions updated, Value Projector bar defaults updated, all citation pills corrected

### Previous Changes (carried forward)

**Removed Reggie Hero Images** — Single-column centered hero, footer memorial preserved

**Soil Score → Coming Soon** — `calculateSoilScore()` returns null, all UI shows "Coming Soon"

**Premium Consultant Connection** — Paywall-gated section on both pages, Formspree modal

**Land Valuation Tool** — ~1,000 lines added to engine: Sales Comparison, Income Cap, Cost Approach, HBU, Three-Approach Reconciliation

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
- **Remove git index.lock** — A stale lock file exists. Run:
  ```bash
  cd ~/Desktop/Claude-Work/"P&X"
  rm .git/index.lock
  git add website/ PX-Session-Handoff.md
  git commit -m "Audit corrections: all values verified against sources, citations fixed"
  git push
  ```

### Still Pending (carried over)
- **Formspree form ID** — `index.html` contact form + consultant modal still have placeholder `YOUR_FORM_ID`
- **Domain `pxconsulting.io`** — Needs DNS records pointed to Vercel

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
| **website/index.html** | P&X homepage (~1,114 lines) |
| **website/terravalue.html** | TerraValue product page (~986 lines) |
| **website/terravalue-engine.js** | TerraValue calculation engine — 7 modules, ~2,310 lines |
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

## About the Founder (for Claude's context)

The founder runs a natural resource consulting firm (P&X — Phloem & Xylem) as a part-time consultancy. Two-tier LLC (Wyoming holding + Georgia operating). ISA Certified Arborist, Urban Forest Specialist, TRAQ. ISA Credentialing Council member. GA Arborist Association Board. B.Sc. Environmental Science. Pursuing Georgia Tech MSPP (Environmental Policy) starting Spring 2027.

**The Soil Principle:** What's visible above ground depends entirely on what's happening below it. Work on root causes, not symptoms.

**Sir Reginald Woofington III (Reggie):** Apricot/red goldendoodle. The P&X mascot. He passed away and lives on through the site. Chief Soil Inspector.

**Working rules:** Ask before starting. Ask where to save files. Ask for permission to share information. Think like him — be an extension of his philosophy, not a replacement for it. Do not include personal name or current employer in any public-facing content.

---

**To continue in a new session:** Share this handoff file + the `P&X/` folder. For TerraValue app work, also include the `terravalue/` folder and its handoff doc.
