# TerraValue — Feature Prioritization Matrix

**Last updated:** 2026-05-20
**Original draft:** 2026-04-29 (v0.1)
**Status:** Working prioritization, v0.2 — incorporates the 2026-05-05 strategic sharpening (see `archive/handoffs/SESSION-HANDOFF-2026-05-05.md`).

---

## What changed in v0.2

- **Strategic spine of the next 90 days** is now #8 (validation study) + #4 (listing badge / broker design partner), with #6 (patent provisional) as the only other true P0.
- **Tax appeal (#3) demoted from P0 to P1**, gated on the validation-study data pipeline. Estimated 3–4 founder-weeks for an MVP, but only ~2 weeks once the broker / MLS infrastructure for #4 + #8 exists.
- **Retail features (Canopy Score, Stormwater calc, tax appeal) are now framed as case-study production**, not primary revenue. They feed paired-sales data and field testimonials into #8.
- **dataQuality flag surfacing (#5)** stays P0 — it's an audit finding, not a revenue lever.

---

## Scoring framework

- **Revenue Potential (1–5)** — how directly this converts to paying customers
- **Build Effort (1–5)** — 1 = days, 5 = quarters; higher = harder
- **Strategic Fit (1–5)** — does this advance the ecosystem-aware AVM positioning
- **Time-to-Revenue** — Quick (<30 days), Medium (1–3mo), Slow (3+mo)
- **Tier** — P0 = ship in next 90 days; P1 = next 90–180 days; P2 = year 2+

Scores are deliberately rough. Treat as relative ranking, not absolute.

---

## Master table

| # | Feature | Revenue | Effort | Strategic | TTR | Tier |
|---|---|---|---|---|---|---|
| 1 | 0–100 Canopy Score (single-number summary) | 4 | 1 | 5 | Quick | **P0** |
| 2 | Stormwater fee credit calculator (Atlanta metro) | 4 | 2 | 4 | Quick | **P0** |
| 3 | Tax assessment appeal report (Georgia) | 4 | 3 | 3 | Medium | **P1** (demoted 2026-05-05; gated on #4 + #8 infra) |
| 4 | Listing-level Green Premium Badge + broker co-branding | 5 | 3 | 5 | Medium | **P0** |
| 5 | Surface dataQuality flags in UI (audit Finding 6) | n/a | 1 | 5 | Quick | **P0** |
| 6 | Provisional patent filing | n/a | 1 | 5 | Quick | **P0** |
| 7 | Productized REST API (auth + rate limits + logging) | 5 | 4 | 5 | Medium | **P0/P1** |
| 8 | Validation study (500+ paired sales, Atlanta metro) | 5 | 4 | 5 | Medium | **P0/P1** |
| 9 | Tree species awareness (i-Tree species table) | 3 | 3 | 4 | Medium | **P1** |
| 10 | Canopy time-series (NAIP 2009 → present) | 3 | 4 | 4 | Slow | **P1** |
| 11 | Climate-risk overlay (FEMA flood, wildfire, heat) | 4 | 3 | 4 | Medium | **P1** |
| 12 | Pre-construction "what-if" tool (developers) | 4 | 3 | 4 | Slow | **P1** |
| 13 | Municipal dashboard (Sandy Springs design partner) | 4 | 4 | 4 | Slow | **P1** |
| 14 | National pipeline (NLCD + canopy raster, 50 states) | 5 | 5 | 5 | Slow | **P1** |
| 15 | Soil Score (SSURGO / NLCD / PAD-US) | 3 | 5 | 5 | Slow | **P1/P2** |
| 16 | Conservation easement valuation (IRS-qualified) | 4 | 5 | 3 | Slow | **P2** |
| 17 | ESG / TCFD / SBTi reporting for institutional landowners | 5 | 4 | 4 | Slow | **P2** |
| 18 | Mobile capture (homeowner photo + AI canopy detection) | 2 | 4 | 3 | Slow | **P2** |
| 19 | Carbon credit on-ramp (NCX/Pachama referral) | 1 | 1 | 2 | Medium | **P2** |
| 20 | HOA / neighborhood portfolio dashboard | 3 | 3 | 3 | Medium | **P2** |
| 21 | AVM-vendor integration pilot (CoreLogic / Clear Capital) | 5 | 4 | 5 | Slow | **P2** |

---

## Quadrant view

```
                       HIGH REVENUE
                            |
       Quick Wins           |          Big Bets
       --------------       |       --------------
       #1  Canopy Score     |    #4  Listing badge
       #2  Stormwater fee   |    #7  API
       #3  Tax appeal       |    #8  Validation study
                            |    #14 National pipeline
                            |    #17 ESG reporting
                            |    #21 AVM integration
                            |
LOW EFFORT  ----------------+----------------  HIGH EFFORT
                            |
       Fill-ins             |       Question Marks
       --------------       |       --------------
       #19 Carbon ramp      |    #15 Soil Score
                            |    #16 Conservation easement
                            |    #18 Mobile capture
                            |
                       LOW REVENUE
```

---

## P0 — next 90 days (v0.2)

The strategic spine: **#8 validation study + #4 broker design partner**, defended by **#6 patent provisional**. Retail features below the spine ship as case-study production — they exist to feed paired-sales data and credibility, not first revenue.

**Spine (must ship):**
1. **Patent provisional filed** (#6) — week 1, $3–5K. The only IP defense before public claims.
2. **Validation study underway** (#8) — Atlanta paired-sales pulled, model running. This is the asset everything else points at.
3. **Listing badge + 1 broker design partner** (#4) — Atlanta intown brokerage. Generates the MLS / paired-sales pipeline that #8 needs.

**Case-study production layer (ship as throughput allows):**
4. **dataQuality flags surfaced in UI** (#5) — week 1–2, closes audit Finding 6.
5. **Canopy Score** (#1) — public widget on landing page, week 2–3. Lead-gen and credibility, not revenue.
6. **Stormwater fee credit calculator** (#2) — first paying retail product, $99–199/report. Treated as case-study throughput.
7. **API v1 in private beta** (#7) — limited concurrency, manual onboarding. Pre-seeds institutional pilot conversations.

**P0 deliverables (end of window):**
- Patent provisional on file
- Validation study pipeline operational, first lift number directionally available
- 1 broker design partner under contract, listings flowing
- Audit finding 6 closed
- ~25–50 case-study reports generated through retail surfaces (not a revenue target — a data target)

## P1 — next 90–180 days (build for seed close)

8. **Tax assessment appeal report (#3)** — demoted from P0 on 2026-05-05; build once #4 + #8 infrastructure exists (~2 founder-weeks once dependencies land)
9. Species awareness (#9)
10. Canopy time-series (#10)
11. Climate-risk overlay (#11)
12. Pre-construction tool with 1 homebuilder design partner (#12)
13. Sandy Springs municipal dashboard pilot (#13)
14. National pipeline ingest (#14)
15. Validation study published as white paper

**P1 deliverable:** Series Seed pitch with revenue, validation lift, IP, design partners, national coverage.

## P2 — year 2+

Bigger, harder, higher-stakes work:

16. Soil Score (#15)
17. Conservation easement valuation (#16)
18. ESG/TCFD product (#17)
19. Mobile capture (#18)
20. HOA portfolio (#20)
21. AVM-vendor integration pilot — CoreLogic or Clear Capital (#21)

---

## Explicit non-goals (for now)

- White-label / private-label arrangements — deferred until brand strength
- International markets — US is plenty
- Direct-to-Zillow integration — comes through CoreLogic, not direct, in this plan
- Insurance integrations — interesting but unclear who pays
- Commercial / industrial real estate — different valuation framework, different buyer
- Agricultural land valuation — NCX/Pachama own this; not our buyer

---

## How to use this matrix

- Anything in **P0** should have a named owner and a 30-day deliverable defined by next Friday.
- Anything in **P1** should have a quarterly milestone tied to seed-round narrative.
- **P2** is revisited at the end of P1 — assume half of these will look different by then.
- **Scores are not rankings within a tier.** Sequence within a tier should follow founder energy, dependency order, and design-partner readiness.

## Open questions to resolve before locking P0

- Is Atlanta the right wedge market, or does Asheville / Portland / Sacramento offer denser canopy + more design-partner brokers?
- Should validation study be Atlanta-only or two-city (Atlanta + a contrasting climate)?
- Patent strategy: provisional only, or PCT + utility?
- API pricing model: per-call, monthly tier, or annual contract?
- Tax appeal report — direct to homeowners or B2B2C through tax appeal attorneys?
