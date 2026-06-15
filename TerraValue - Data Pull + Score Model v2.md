# TerraValue — Data Pull + Score Model v2

**Date:** 2026-06-15
**Status:** Design / build plan. Grounded in (a) a *live* endpoint probe run this date from the `www.terravalue.app` origin, and (b) a read of the current `terravalue-engine` + `px-website/api` source.
**Scope:**
1. Re-add the server-side parcel / environmental **data pull** (the dormant federal integrations), corrected with live CORS + URL findings.
2. Extend the **Soil Score** to incorporate measured **air quality**, **park equity**, and **walkability** — without double-counting the existing canopy-driven outputs.

**Supersedes:** the endpoint assumptions in `archive/handoffs/HANDOFF-CORS-PROXY.md` (the *approach* there is still right; several of its per-endpoint facts are now stale — see §2).
**Feeds:** the area-level (neighborhood / city / district) valuation direction (§6).

---

## 0. TL;DR

- The data-pull was **never deleted** — all seven modules are intact in `terravalue-react-archive/src/integrations/*` plus `parcelData.js`. It went dormant because it called CORS-less federal APIs **from the browser** (rolled back 2026-05-09), and the 2026-05-10 cutover to the standalone HTML then orphaned the React app that held it.
- Fix = move the pulls **server-side** behind `pxconsulting.io/api/proxy/*`. Server-to-server requests are **not subject to CORS**. A live probe shows the proxy surface is **smaller than the old 6-route plan**.
- **Direct-callable today (send CORS):** AirNow (needs key), NRCS soil, EnviroAtlas (path corrected in §2/§5). **Need the proxy:** Census geocoder, NLCD canopy, NLCD impervious, NOAA Atlas 14, PRISM.
- The **Soil Score is currently a stub** — `EcosystemServices.calculateSoilScore()` returns `null`, and `engine.analyze()` falls back to `currentScore = canopyPct ÷ 40 × 100`. So the "score" today is *just canopy*. That's the clean insertion point for a real, weighted, multi-signal score.
- **EnviroAtlas `Community_BGmetrics` is a shortcut**: one CORS-OK call returns park access, green space, tree cover, air-quality removal, and impervious — most of the new signals, at the **block-group grain** the area-level product wants.

---

## 1. Why the feature came out (context)

Not because it was wrong. Two stacked causes, from the archived handoffs:

1. **Architecture bug (2026-05-09).** An earlier session shipped a parcel-data module + 6–7 federal integrations into the React app. They ran **in the browser**, calling federal endpoints directly. Those endpoints don't return `Access-Control-Allow-Origin`, so the browser received the data and discarded it — every call failed in production. It was rolled back to the Nominatim-only flow to keep the site clean; the modules were left in place for the planned proxy fix.
2. **Surface change (2026-05-10).** The "Reading 3 cutover" intentionally replaced the React app with the simpler standalone HTML form (no auto-populate). That orphaned the entire React app — and the integrations with it. The proxy task was marked "obsolete," noted as still valid "if federal-data auto-populate is ever wanted… as a v2 feature."

**This doc is that v2.**

---

## 2. Live endpoint probe — verdict table

Run 2026-06-15 from `https://www.terravalue.app` (Nominatim used as a CORS control; it returned 200 + data, confirming no page-level CSP skewed the test).

| Source | Browser-direct? | Live evidence | Action |
|---|---|---|---|
| **AirNow** | ✅ Yes (CORS) | readable `401 Invalid API key` (type: cors) | Direct **with a key** — or proxy only to hide the key |
| **NRCS soil (SDA)** | ✅ Yes (CORS) | readable `200 {"Table":[["AK600"]]}` on a POST | Direct — **newly CORS-OK** (was blocked in May '26) |
| **EnviroAtlas (EPA ArcGIS)** | ⚠️ Host CORS-OK, old path dead | readable `200` → `error 404 "Communities/Atlanta_GA/MapServer not found"` | Direct; **use corrected path** (§5) |
| **Census geocoder** | ❌ No | `Failed to fetch` | Proxy |
| **NLCD canopy (MRLC ImageServer)** | ❌ No | `Failed to fetch` | Proxy (+ confirm URL — see caveat) |
| **NLCD impervious (MRLC ImageServer)** | ❌ No | `Failed to fetch` | Proxy (+ confirm URL) |
| **NOAA Atlas 14 PFDS** | ❌ No | `Failed to fetch` | Proxy |
| **PRISM (nacse.org)** | ❌ No | `Failed to fetch` | Proxy (or use EnviroAtlas `PRISM` folder — CORS-OK host) |

**What changed vs. the May 2026 notes:** NRCS is now **direct** (one fewer proxy route); EnviroAtlas's per-city Atlanta service was **removed** (consolidated — see §5).

**Audit-honest caveat.** For the five blocked sources the browser **cannot see their true upstream status** — the uniform `503` they showed in the network log is the monitor's placeholder for a CORS-rejected response (five independent gov servers are not all down at once). A server-side `web_fetch` of the two NLCD services returned empty (inconclusive — the tool doesn't render raw ArcGIS JSON). **Before building the NLCD routes, confirm the MRLC paths with a laptop `curl`** (server-side, no CORS) — EnviroAtlas just proved these ArcGIS services do get reorganized. Census / NOAA / PRISM are almost certainly alive-but-CORS-less (stable public services).

---

## 3. The data-pull architecture (server-side proxy)

**Pattern.** Add a `/api/proxy/*` prefix to the existing single-dispatcher `px-website/api/index.js` (the same `ROUTES` table that serves `/api/ecosystem`, etc.). Each handler fetches the upstream server-side and returns the body. Why it works: **CORS is a browser policy**; a Node function calling NRCS has no origin and no browser policing it, so it just gets the data. The page then does a normal same-origin `fetch()` to your proxy — live, per-address, browser-driven, but the federal hop happens on your server.

**Routes you actually need** (per §2): `census/geocode`, `nlcd/canopy`, `nlcd/impervious`, `noaa/atlas14`, `prism/normals`. ~5 routes / 4 sources.

**Call direct (no proxy):** AirNow (move the key to `process.env.AIRNOW_API_KEY` and proxy *only* to hide it, optional), NRCS soil, EnviroAtlas.

**Cross-cutting:**
- **Cache aggressively** — federal data is stable for months/years. `Cache-Control: public, max-age=86400`; Vercel's CDN caches server-side, bandwidth ≈ 0.
- **Rate limiting** — NRCS / NOAA throttle aggressive callers; the proxy funnels everything through Vercel, so add limits if needed (not at MVP scale).
- **Key hygiene** — AirNow key lives server-side only when proxied.
- **One foundation, two products** — this same server-side pull powers both single-address auto-populate *and* the batch area pipeline (§6). Build it once, server-side.

---

## 4. Score Model v2 — air quality, park equity, walkability

### 4.1 Three channels — do not conflate them

The engine already produces three independent outputs. Every new signal belongs in one or more, and naive inclusion **double-counts**:

1. **Ecosystem-service dollars** — supply-side, currently all canopy-driven (carbon, stormwater, air-quality *removal*, energy, habitat).
2. **Property value** — USPAP three-approach; amenities enter via `locationQuality` (1–5), comparable adjustments, and one-time premiums (the 7% canopy premium).
3. **Soil Score (0–100)** — the composite "environmental quality of place" index. **Currently a stub** (`calculateSoilScore` → null; fallback `canopyPct ÷ 40 × 100`).

### 4.2 Decision first: what does the Soil Score *mean*?

You must scope it before adding factors:
- **(A) Ecological stewardship of the parcel** — canopy, soil, impervious, biodiversity.
- **(B) Environmental *livability* of the place** — adds ambient air quality, park access, walkability.

Walkability especially pushes toward (B). **Recommendation:** adopt (B) but keep the name's "stewardship" spirit by weighting parcel-ecology factors highest. Make the Soil Score an **explicit weighted composite of normalized 0–100 sub-scores**, each normalized as a **percentile within the metro** (so scores are comparable across regions *and* the normalization falls straight out of the area-pull you're already building).

### 4.3 Proposed composite (illustrative weights — yours to set)

| Sub-score | Source(s) | Formula sketch (→ 0–100, metro percentile) | Weight | In score because |
|---|---|---|---|---|
| Canopy | NLCD TCC / EnviroAtlas L41 | % tree cover, percentile-ranked | 0.30 | existing core |
| Air quality | EPA AQS annual PM2.5 (scoring) + AirNow (live UI) | invert annual mean vs 9 µg/m³ NAAQS | 0.20 | health/livability |
| Green & park access | EnviroAtlas L35/L12 / TPL ParkServe | % pop within 500m of park entrance + green space per capita | 0.20 | access/equity |
| Walkability | EPA Smart Location DB / NWI (or Walk Score) | National Walkability Index, percentile | 0.15 | livability/value |
| Impervious & soil | NLCD impervious L23 + NRCS SSURGO | invert % impervious; soil health bonus | 0.15 | parcel ecology |

Keep ecosystem-service **dollars** and **valuation** premiums as **separate outputs** so the score, the $/yr, and the market value stay independent and auditable.

### 4.4 Per-signal placement

**Air quality (AirNow + others).** Don't double-count: the existing **$418/canopy-acre "air quality"** is the trees' pollutant *removal* (supply). Ambient AQ is the resulting *exposure* (state of the air) — distinct. Keep the canopy-removal dollars; add ambient AQ as a **score sub-factor only**.
- **AirNow** = real-time "today" AQI → great for a **live UI badge**, wrong for a stable score (swings hourly).
- **EPA AQS annual mean PM2.5** vs the 2024 NAAQS (9 µg/m³) → the **scoring** input (stable, authoritative). PurpleAir / EnviroAtlas fill gaps. Monitors are sparse (≈county); per-parcel AQ needs interpolation/modeling → record it in `dataQuality.confidence`.
- Ambient AQ's hedonic effect on value is weak and income-collinear → **keep out of the value model initially**.

**Park equity.** Sources: **EnviroAtlas L31/L35/L70** (% pop within/without 500m of a park entrance — block-group, CORS-OK), **TPL ParkServe/ParkScore** (10-min-walk coverage + demographic equity), USGS **PAD-US** (park polygons for distance/walk-time).
- Park *proximity* → **value** (distance-decay premium) via `locationQuality`/a small premium.
- Park *access* → **score** "green access" sub-factor.
- The word **"equity" is distributional** — it's an **area-level** metric (gap / Gini of access, access-by-demographic). So *access* is the per-parcel input; *equity* is a feature of the neighborhood/city/district product (§6).

**Walkability.** Sources: **EPA Smart Location Database / National Walkability Index** (free, block-group, authoritative — intersection density, transit, land-use mix) — *not* in EnviroAtlas; or **Walk Score API** (commercial, address-level, brand recognition); or OSM street-network isochrones.
- Primarily a **value** factor (walkability↔price is among the most robust hedonic findings) → `locationQuality`/walkability premium.
- A **score** factor *only* under the livability definition (4.2-B). It's an amenity, not parcel stewardship.

### 4.5 Double-count map

| Signal | Ecosystem $ | Property value | Soil Score | Watch-out |
|---|---|---|---|---|
| Canopy | ✅ existing | ✅ 7% premium | ✅ | already in all three — don't re-add |
| Ambient AQ | ❌ (keep canopy-removal $ separate) | ➖ optional/disclosure | ✅ | distinct from canopy AQ-removal $ |
| Park access | ❌ | ✅ proximity premium | ✅ green access | equity = **area** metric, not parcel |
| Walkability | ❌ | ✅ premium | ➖ livability-only | amenity, not stewardship |
| Impervious / soil | ➖ (stormwater $ exists) | ➖ minor | ✅ | don't recount stormwater value |

---

## 5. EnviroAtlas — corrected path + the pilot shortcut

The per-city `Communities/Atlanta_GA/MapServer` is **gone**. The `Communities` folder now exposes two consolidated services:

- `Communities/Community_BGmetrics/MapServer` — **115 block-group layers** of fine-scale community metrics (all EnviroAtlas community areas, incl. Atlanta). **CORS-OK, no key.**
- `Communities/Community_Locations/MapServer` — community boundary/extent layer.

Relevant layer IDs (confirmed live) for TerraValue's new signals:

| Layer ID | Metric | Feeds |
|---|---|---|
| 41 | Percent tree cover | Canopy sub-score (cross-check NLCD) |
| 77 | Tree cover per capita (m²/person) | Canopy/equity |
| 35 / 31 | % residential pop **within / not within 500m of a park entrance** | **Park access + equity** |
| 70 / 64 | Residential pop within / not within 500m of a park entrance (count) | Park equity (area rollup) |
| 12 / 22 | Green space per capita (m²/person) / Percent green space | Green access |
| 13 / 23 | Impervious area per capita / Percent impervious [BG] | Impervious sub-score |
| 19 / 38 | PM2.5 removed annually by tree cover (kg/yr) / Percent | Air-quality *removal* (cross-check $418/ac) |
| 78–86 | **Dollar values** of health/damage avoided from pollutant removal ($/yr) | Validate ecosystem-$ methodology |
| 29 / 30 / 68 / 69 | Busy roadway bordered by </>  25% tree buffer (pop) | Health equity (roadway exposure) |
| 39 / 47 | Reduction in annual runoff due to tree cover (% / m³) | Stormwater sub-service |

**Why this matters:** for the Atlanta pilot, a *single* CORS-OK source delivers park access, green space, canopy, impervious, and air-quality removal **at block-group grain** — i.e., already aggregated to the neighborhood level the area product needs. Caveat: it's **block-group**, not parcel — a single parcel inherits its block-group value (fine for area/neighborhood scoring; for hyperlocal parcel precision use NLCD raster zonal stats). Walkability still comes from EPA SLD/NWI.

There is also an EnviroAtlas-hosted `PRISM` folder (CORS-OK host) — a possible direct alternative to the CORS-blocked `nacse.org` PRISM. Verify its coverage when wiring climate inputs.

---

## 6. How this powers area-level pulls

Same foundation, two products:
- **Per-address auto-populate** (re-adding the original feature) = browser → your proxy/direct sources → fill the form.
- **Neighborhood / city / district** = enumerate parcels in a boundary (Census TIGER + a parcel layer) → join **EnviroAtlas block-group metrics** (park access, green space, canopy, AQ, impervious) + per-parcel NLCD/assessor → run the engine in **batch** → store per-parcel score/value + vintage + confidence in **PostGIS** → an area pull becomes a spatial query + aggregation (total ecosystem $/yr, mean Soil Score, median value, **park-equity distribution**, canopy/impervious histograms).

Precompute offline; serve area queries from the store. The score normalization in §4.3 (metro percentile) is computed once over the area's distribution.

---

## 7. Next steps & open decisions

1. **Confirm endpoint statuses** — laptop `curl` the five proxy sources (esp. MRLC NLCD canopy/impervious) to split "needs proxy (URL fine)" from "needs URL fix too." (Per the original handoff's own advice.)
2. **Decide the Soil Score definition** (4.2-A stewardship vs 4.2-B livability) and the **weights** (4.3). This is a product call — it determines what belongs.
3. **Pick the walkability source** — EPA SLD/NWI (free, block-group) vs Walk Score API (paid, address-level).
4. **Build `/api/proxy/*`** routes (Census, NLCD ×2, NOAA, PRISM) in `px-website/api/index.js`; wire AirNow + NRCS + EnviroAtlas direct. Propose the implementation in chat before writing code (working rule).
5. **Pilot Atlanta** — constants are already GA-calibrated; EnviroAtlas community metrics cover it. Stand up the per-address pull first, then the block-group area rollup.

---

## 8. Global cities — sources, tiers, and the cost of regionalizing

**Goal:** value parcels in major global cities "that offer significant and proper data access." Reality check: *everything* probed in §2 is **US-only**. Going global splits into an easy half and a hard half.

**Architecture (drafted in `drafts/proxy.draft.js`):** two layers behind one proxy.
- **Global baseline** — works in any city: geocode = OSM Nominatim; air quality = **OpenAQ** (global REST API — PM2.5/PM10/NO2/O3, aggregates government + sensor data); parks = OSM Overpass (`leisure=park`); canopy/land cover = **ESA WorldCover (10m)** or **Meta–WRI 1m canopy height** (raster → zonal-stats job, not a live point call); walkability = computed from the OSM street network.
- **Premium city adapters** — light up where a city/country publishes authoritative open data. The proxy's jurisdiction registry picks the adapter by country, else falls back to baseline.

**Why most of the EU is "tier-1":** the **INSPIRE Directive** mandates open cadastral parcels + addresses across member states, so most EU capitals already expose parcel geometry via national OGC/REST services.

**Tier-1 cities (verified June 2026):**

| City / country | Parcel / cadastre | Canopy / green | Air quality | Access |
|---|---|---|---|---|
| **Singapore** | OneMap (planning-area polygons, geocode) + URA Data Service API (transactions, land use; token) | NParks Trees.sg | NEA via data.gov.sg realtime API | ★★★ APIs + token |
| **London / UK** | HM Land Registry Price Paid (open) + INSPIRE Index Polygons (freehold, E&W, monthly); OS MasterMap | GLA London Datastore canopy | London Air (LAQN) / DEFRA UK-AIR | ★★★ open |
| **Amsterdam / NL** | Kadaster BAG + BRK via PDOK (JSON REST / OGC) | gemeente + PDOK | RIVM / Luchtmeetnet | ★★★ REST |
| **Berlin / DE** | ALKIS via FIS-Broker (WMS/WFS) | **Umweltatlas** (EnviroAtlas-like green/climate atlas) | UBA / Berlin Luftdaten | ★★★ rich env atlas |
| **Barcelona · Madrid / ES** | **Catastro** OGC/REST (≈95% of Spain) | Open Data BCN | local + EEA | ★★★ national API |
| **Paris / FR** | **API Carto** cadastre module (IGN / Étalab) | Paris OpenData (arbres) | Airparif | ★★★ national API |
| **New York / US** | NYC Open Data **PLUTO** (excellent) | NYC tree census + US NLCD/EnviroAtlas | AirNow / OpenAQ | ★★★ |

Also strong, to validate next: Vienna (data.wien.gv.at), Toronto, Helsinki/Copenhagen/Oslo, Melbourne/Sydney (cadastre sometimes restricted).

**The hard half — regionalizing the engine's constants.** Data adapters are the *easier* lift; the methodology is US-coded:

| Constant | US today | Global needs |
|---|---|---|
| Carbon price | EPA SC-GHG ($190/t) | EU ETS / UK ETS market price; SG carbon tax (S$/t); none elsewhere |
| Currency | USD | local currency + FX |
| AQ standard (scoring) | US NAAQS 9 µg/m³ | **WHO 2021 guideline 5 µg/m³** as the global normalizer; EU limit values |
| Cap / discount rates | GA/US (JLL) | per-market (JLL/CBRE per country) |
| Electricity rate | GA Power $0.14/kWh | IEA per-country tariffs |
| **Property-value basis** | `assessedValue` (US assessor) | **no clean analog** — UK council-tax bands, SG Annual Value, NL WOZ-waarde, etc. |

That last row is the real one: the valuation engine leans on a US `assessedValue` input many countries don't produce the same way.

**Sequencing recommendation — split the score from the valuation.**
1. **Phase 1 — ecosystem services + Soil Score, globally.** Canopy, air quality, parks, impervious are portable; normalize AQ to the WHO guideline and value carbon in local units. This lights up the *score* for tier-1 cities fast and is the most defensible global claim.
2. **Phase 2 — property valuation, per country.** Map each country's value basis (council-tax band / Annual Value / WOZ / cadastral value) to the engine's inputs, and regionalize cap rates, HPI, and construction costs — one country at a time, behind the same API contract (the "migrate later behind the contract" pattern already in your plan).

Net: TerraValue's *ecosystem-aware score* travels well now; the *AVM* travels per-country.

---

## Appendix A — exact endpoints (as probed 2026-06-15)

| Source | Method | URL | Status |
|---|---|---|---|
| Census geocoder | GET | `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=…&benchmark=Public_AR_Current&format=json` | proxy |
| NRCS soil (SDA) | POST | `https://sdmdataaccess.nrcs.usda.gov/Tabular/SDMTabularService/post.rest` | **direct (CORS-OK)** |
| AirNow | GET | `https://www.airnowapi.org/aq/observation/latLong/current/?…&API_KEY=…` | **direct (key)** |
| NLCD canopy (TCC) | GET | `https://www.mrlc.gov/arcgis/rest/services/Tree_Canopy/USFS_NLCD_TCC_CONUS_All/ImageServer/identify?…` | proxy (verify URL) |
| NLCD impervious | GET | `https://www.mrlc.gov/arcgis/rest/services/Land_Cover/NLCD_Impervious_Cover_All_Years/ImageServer/identify?…` | proxy (verify URL) |
| NOAA Atlas 14 | GET | `https://hdsc.nws.noaa.gov/cgi-bin/hdsc/new/cgi_readH5.py?lat=…&lon=…&type=pf&data=depth&series=pds&units=english` | proxy |
| PRISM | GET | `https://services.nacse.org/prism/data/public/4km/<lon>,<lat>/normals_annual` | proxy |
| EnviroAtlas BG metrics | GET | `https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer/identify?…&f=json` | **direct (CORS-OK)** |

Walkability (not yet integrated): EPA Smart Location Database / National Walkability Index — `https://www.epa.gov/smartgrowth/smart-location-mapping` (data/REST), or Walk Score API.

---

*Provenance: endpoint behavior from a live browser probe on 2026-06-15; engine/API facts from `terravalue-engine/lib` + `px-website/api/index.js` at the repo state of this date. Soil Principle — work the foundations, not the appearances.*
