# TerraValue — US City Rollout (14 cities)

**Date:** 2026-06-15
**Status:** Scoping matrix. EnviroAtlas coverage + neighborhood facts verified live (EnviroAtlas service, June 2026); climate zones are standard IECC references; parcel-source *agencies* are authoritative but exact REST endpoints are marked **(verify)** for wiring time.
**Cities (14):** Atlanta, **Sandy Springs**, Chicago, Miami, New York, Seattle, Los Angeles, Tacoma, Denver, Dallas, Austin, Baltimore, Washington DC, San Diego.
**Companion to:** `TerraValue - Data Pull + Score Model v2.md` (architecture, score model, proxy draft).

---

## 0. The good news

All 14 cities share **one federal environmental stack** (CONUS coverage). The *only* things that vary city-to-city are **(a) the parcel/assessor source** and **(b) a handful of regionalization constants**. So this is 14× a small adapter, not 14× a rebuild — and Sandy Springs is nearly free, since it's Fulton County / the same Atlanta MSA, climate zone, and state as Atlanta (it inherits Atlanta's constants block; see §6).

One caveat surfaced by querying EnviroAtlas directly: its **fine-scale "Community" data covers 8 of the 14**; the other 6 use the coarser all-US **National** block-group layer + NLCD. Details in §2.

---

## 1. Shared federal stack — covers all 14, no per-city work

| Signal | Source | Grain | Notes |
|---|---|---|---|
| Tree canopy | NLCD USFS TCC (MRLC) | 30 m, all 14 | + EnviroAtlas "% tree cover" where Community |
| Green/park access, impervious, AQ-removal | **EnviroAtlas** | 1 m Community (8 cities) / BG National (all 14) | park-access layers 31/35/70; green 12/22; impervious 13/23 |
| Ambient air quality | EPA AQS annual (scoring) + AirNow (live) + OpenAQ | monitor → BG | normalize to WHO 5 µg/m³ or NAAQS 9 µg/m³ |
| Walkability | EPA Smart Location DB / National Walkability Index | block group, all 14 | not in EnviroAtlas |
| Soil | NRCS SSURGO (SDA — CORS-OK) | polygon, all 14 | direct, no proxy |
| Precip/climate | NOAA Atlas 14 + PRISM | point, all 14 | proxy |

**None of the above need per-city engineering.** The score (canopy + AQ + parks + impervious + walkability) is computable for all 14 from day one.

---

## 2. Per-city matrix

| City | Parcel / assessor source (authoritative) | Open-data access | EnviroAtlas fine-scale? | IECC climate zone | State | FHFA MSA (HPI) |
|---|---|---|---|---|---|---|
| **Atlanta** | Fulton (+ DeKalb) County GIS / qPublic | Good (ArcGIS) | ❌ National only | 3A | GA | Atlanta–Sandy Springs–Alpharetta |
| **Sandy Springs** | Fulton County Tax Assessor / qPublic (+ city GIS) | Good (ArcGIS) | ❌ National only | 3A | GA | Atlanta–Sandy Springs–Alpharetta |
| **Chicago** | Cook County Assessor / Cook County GIS | Strong (Socrata + ArcGIS) | ✅ | 5A | IL | Chicago–Naperville–Elgin |
| **Miami** | Miami-Dade Property Appraiser Open Data | Excellent (ArcGIS Hub) | ❌ National only | 1A | FL | Miami–Fort Lauderdale–Pompano Beach |
| **New York** | NYC Dept of City Planning **MapPLUTO** | Excellent (NYC Open Data) | ✅ | 4A | NY | New York–Newark–Jersey City |
| **Seattle** | King County Assessor / King County GIS | Strong (ArcGIS) | ❌ National only | 4C (marine) | WA | Seattle–Tacoma–Bellevue |
| **Los Angeles** | LA County Assessor / LA County GIS Hub | Strong (ArcGIS) | ✅ | 3B | CA | Los Angeles–Long Beach–Anaheim |
| **Tacoma** | Pierce County Assessor-Treasurer / GIS | Good (ArcGIS) | ✅ | 4C (marine) | WA | Seattle–Tacoma–Bellevue |
| **Denver** | City & County of Denver Open Data | Excellent (consolidated city-county) | ❌ National only | 5B | CO | Denver–Aurora–Lakewood |
| **Dallas** | Dallas Central Appraisal District (DCAD) + Dallas County GIS | Good (CAD model) | ❌ National only | 3A | TX | Dallas–Fort Worth–Arlington |
| **Austin** | Travis Central Appraisal District (TCAD) + City of Austin Open Data | Strong (Socrata) | ✅ | 2A | TX | Austin–Round Rock–Georgetown |
| **Baltimore** | MD SDAT / MdProperty View + Open Baltimore | Strong (state + city) | ✅ | 4A | MD | Baltimore–Columbia–Towson |
| **Washington DC** | DC OCTO Open Data (parcels + CAMA) | Excellent | ✅ | 4A | DC | Washington–Arlington–Alexandria |
| **San Diego** | San Diego County Assessor / SanGIS | Strong (ArcGIS) | ✅ | 3B | CA | San Diego–Chula Vista–Carlsbad |

EnviroAtlas fine-scale (verified 2026-06-15): **✅** Austin, Baltimore, Chicago, LA, NYC, San Diego, Tacoma, DC · **❌** Atlanta, Sandy Springs, Miami, Dallas, Denver, Seattle (→ EnviroAtlas National BG + NLCD).

---

## 3. The only per-city integration: parcels

Environmental handlers in `drafts/proxy.draft.js` are shared US-federal for all 14. The work per city is a **parcel adapter** against that city/county's assessor GIS — almost all are **ArcGIS REST** (FeatureServer/`query` by point) or **Socrata**, so the adapter is a thin, repeatable shape:

```
point (lat,lon)  →  county FeatureServer /query  →  { lotSizeSqFt, assessedValue,
                                                       buildingSqFt, yearBuilt,
                                                       landUse/propertyType, APN }
```

Verify each endpoint at wiring (URLs drift). Best-in-class to start with: **DC (OCTO)**, **NYC (MapPLUTO)**, **Miami-Dade**, **Denver** — clean, documented, single-jurisdiction. (Atlanta + Sandy Springs share Fulton County — one adapter covers both.)

---

## 4. Regionalization constants — what varies, and at what level

| Level | Constant | Source to fill from | In engine today |
|---|---|---|---|
| National (no change) | Social cost of carbon, methodology coefficients, PM2.5 NAAQS | EPA SC-GHG / peer-reviewed | ✅ already |
| **State** | Electricity & gas rate; assessment ratio & rules; transfer/intangible tax | EIA (per state); state DOR | only `georgia` block |
| **Metro (MSA)** | Appreciation / HPI; cap & discount rates; construction cost | FHFA MSA HPI; JLL/CBRE per market; RS Means city multiplier | only `atlanta`/`national` |
| **City / climate zone** | Energy-savings & stormwater ecosystem rates | scale by IECC zone + local electricity price + NOAA/PRISM precip | Atlanta values applied universally |

**Proposed config shape** — extend `terravalue-engine/config/land-valuation-constants.json` with a `markets` map keyed by city (numbers to be sourced, not invented):

```jsonc
"markets": {
  "atlanta": {
    "state": "GA", "fhfaMSA": "Atlanta-Sandy Springs-Alpharetta",
    "climateZone": "3A", "enviroAtlasCommunity": false,
    "capRates": { "singleFamily": { "low": 0.04, "mid": 0.055, "high": 0.07 } },  // override defaults
    "constructionCostMultiplier": 0.92,   // RS Means city index vs national 1.00
    "appreciation": { "1yr": 0.038, "5yr": 0.052, "10yr": 0.045 },               // FHFA MSA
    "electricityRate": 0.14,              // EIA, $/kWh
    "assessmentRatio": 0.40, "millage": 0.030
  },
  "sandySprings": { "inherits": "atlanta", "enviroAtlasCommunity": false },        // same county/MSA/zone
  "washingtonDC": { "state": "DC", "fhfaMSA": "Washington-Arlington-Alexandria",
    "climateZone": "4A", "enviroAtlasCommunity": true, /* …source the rest… */ }
  // …one block per city…
}
```

The engine selects the `markets[city]` block by the parcel's geocoded jurisdiction (with an `inherits` link for submarkets like Sandy Springs), falling back to `national`. This is the clean home for everything that's "Atlanta-only" today.

> Honesty note: this doc gives the **structure + the authoritative source for each number** — it does **not** invent the cap rates, multipliers, or HPI values. Those should be pulled from the cited sources before they go in config.

---

## 5. Recommended pilot order

1. **Atlanta + Sandy Springs** — engine is already GA-calibrated and both are Fulton County / same MSA, so they share constants and isolate the new parcel + score pipeline. (Both use EnviroAtlas National + NLCD, not fine-scale.)
2. **DC + NYC** — best open parcel data (OCTO, MapPLUTO) *and* EnviroAtlas fine-scale → the cleanest full end-to-end, and the best showcase.
3. **The rest, grouped by state** to reuse state-level constants: **TX** (Dallas + Austin), **CA** (LA + San Diego), **WA** (Seattle + Tacoma — they even share the Seattle–Tacoma–Bellevue MSA). Then Chicago, Miami, Denver, Baltimore.

---

## 6. Honest flags

- **6 cities lack EnviroAtlas fine-scale** (Atlanta, Sandy Springs, Miami, Dallas, Denver, Seattle) → use EnviroAtlas National BG metrics (coarser) + NLCD canopy. Atlanta was an EnviroAtlas community historically (hence the dead `Atlanta_GA` path) but isn't in the current Community service.
- **Sandy Springs inherits Atlanta's market block** — same Fulton County parcel source, same Atlanta–Sandy Springs–Alpharetta MSA, same 3A climate zone, same GA state rules. No new constants; it needs only its own boundary + neighborhood/org units (§7). (Its *local* price level differs from Atlanta's, but that rides in via assessed value + comps, not the MSA constants.)
- **Seattle vs Tacoma:** Tacoma has fine-scale EnviroAtlas, Seattle doesn't; both share one FHFA MSA. Don't let the shared MSA hide the different data grain.
- **Parcel access varies:** DC/NYC/Miami-Dade/Cook/Denver are excellent; the Texas cities use **County Appraisal Districts** (DCAD/TCAD) with a different model and sometimes bulk-download rather than live API — confirm per city.
- **Constants are unfilled here by design** — §4 is a schema + sourcing map, not numbers.

---

## 7. Neighborhoods, org units & cross-city equity

**Why:** to track *equity of the Soil Score* — within a city (is green/clean/walkable amenity evenly distributed?) and across cities (which cities distribute it most equitably, not just which score highest). This is the environmental-justice lens, and it's where the area-level product earns its keep.

**Org-unit hierarchy — compute once, roll up many ways:**

```
parcel  →  Census block group  →  local neighborhood / org unit  →  city  →  metro
           (analytical atom)        (locally legible / governance)
```

- **Block group = the analytical atom.** 600–3,000 people; it's where ACS demographics, EnviroAtlas BG metrics, and Tree Equity Score all already live. Compute the Soil Score per parcel, aggregate to BG. Universal across all 14 cities.
- **Local neighborhood / org unit = the legible layer.** Roll BGs up to the units locals actually use — many of which are *governance* units, ideal for "org units": Atlanta **NPUs** (25, lettered A–Z), DC **Neighborhood Clusters / ANCs**, NYC **NTAs** (Neighborhood Tabulation Areas, nest in Community Districts), Chicago **77 Community Areas**, Denver **78 statistical neighborhoods**. A block-group → neighborhood crosswalk (centroid/areal) does the rollup. **Sandy Springs** has no NPU system — use its **6 City Council districts** + named communities as org units.

**Boundary sources:**

| Layer | Source | Coverage |
|---|---|---|
| Block group / tract | Census TIGER/Line + ACS demographics | all 14 (universal backbone) |
| Locally-accepted neighborhoods | **"City-Defined Neighborhood Boundaries in the US"** (Nature *Scientific Data*, 2025 — 206 cities + block demographics) + each city's open data | all 14 |
| Governance units | city open data — NPU / ANC / Community Area / NTA / council district | per city |
| Canopy-equity benchmark | **American Forests Tree Equity Score** — block group, Shapefile/GeoJSON/CSV | all 14 |

**Equity metrics — two scopes:**

- **Within-city:** distribution of the Soil Score across BGs/neighborhoods — a **Gini coefficient** and the **top-decile ÷ bottom-decile** ratio — plus the **correlation of score with ACS income & race** (do lower-income / minority neighborhoods score systematically lower on canopy, park access, air quality?). This mirrors Tree Equity Score's method, generalized from canopy-only to the full Soil Score.
- **Cross-city:** rank the 14 by *both* mean score **and** inequity (score Gini, and the high- vs. low-income amenity gap). A city can post a high average and high inequity — that gap is the story the equity layer surfaces.

**Methodology caveat — keep absolute *and* normalized.** The v2 doc normalizes the Soil Score to metro percentile (good for *within-city* relative equity). For *cross-city* comparison that erases real differences (a 15%-canopy city and a 45%-canopy city both show a full 0–100 internal spread). So store **both**: the metro-percentile score (relative / within-city) **and** the absolute sub-metrics (raw canopy %, annual PM2.5, % population within 500 m of a park). Cross-city equity uses the absolutes; within-city equity can use either.

**Precedent — don't reinvent it, extend it.** American Forests' **Tree Equity Score** already does exactly this for canopy + heat at block-group level nationwide, joining canopy to income, race, age, and health, with downloadable data. TerraValue's move is to (a) generalize it from canopy-only to a multi-factor Soil Score (canopy + air quality + park access + walkability + impervious) and (b) add the property-value layer. **Ingest TES directly** as both a ready canopy-equity input and a validation benchmark for your equity numbers.

---

## Appendix — EnviroAtlas Community list (32, verified 2026-06-15)

Austin TX · Baltimore MD · Birmingham AL · Brownsville TX · Chicago IL · Cleveland OH · Des Moines IA · Durham NC · Fresno CA · Green Bay WI · Los Angeles CA · Memphis TN · Milwaukee WI · Minneapolis/St. Paul MN · New Bedford MA · New Haven CT · New York NY · Paterson NJ · Philadelphia PA · Phoenix AZ · Pittsburgh PA · Portland ME · Portland OR · Salt Lake City UT · San Diego CA · Sonoma County CA · St. Louis MO · Tacoma WA · Tampa FL · Virginia Beach/Williamsburg VA · Washington DC · Woodbine IA

Service (CORS-OK, no key): `https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer` (115 BG metric layers) · `…/Community_Locations/MapServer` (community boundaries).

*Provenance: EnviroAtlas coverage + service paths queried live 2026-06-15; neighborhood-unit facts (NPU/NTA/Community Area/statistical neighborhood) and Tree Equity Score per web sources June 2026; climate zones per IECC/ASHRAE 169 standard references; parcel agencies authoritative, endpoints to verify at wiring.*
