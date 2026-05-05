# TerraValue — Feature Prioritization Matrix
**Date:** April 29, 2026
**Status:** Working prioritization, v0.1

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
| 3 | Tax assessment appeal report (Georgia) | 4 | 3 | 3 | Medium | **P0** |
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

## P0 — next 90 days

The 90-day plan optimizes for two things: maximum signal in a seed pitch, and minimum first revenue.

1. **Patent provisional filed** (#6) — week 1, $3–5K
2. **dataQuality flags surfaced in UI** (#5) — week 1–2, closes audit Finding 6
3. **Canopy Score** (#1) — public widget on landing page, week 2–3
4. **Stormwale fee credit calculator** (#2) — first paying product, $99–199/report
5. **Tax appeal report MVP** (#3) — second paying product, $299–499/report
6. **Listing badge + 1 broker design partner** (#4) — Atlanta intown brokerage
7. **API v1 in private beta** (#7) — limited concurrency, manual onboarding
8. **Validation study underway** (#8) — Atlanta sales pulled, model running

**Revenue target end of P0:** 50–100 paid reports, 1 broker partner contract, 1 institutional pilot LOI.

## P1 — next 90–180 days (build for seed close)

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
