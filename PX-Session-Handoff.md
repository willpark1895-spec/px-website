# P&X — Session Handoff
**Date:** April 9, 2026
**Purpose:** Drop this file (along with the `P&X/` project folder) into a new Cowork session so Claude can pick up exactly where we left off.

---

## What Happened This Session

### 1. P&X Website Created From Scratch
Built a complete, production-ready static website for P&X (Phloem & Xylem) — William Park's natural resource and urban forestry consulting firm based in Sandy Springs, GA.

**Homepage (index.html)** — 798 lines, single-file HTML/CSS/JS:
- Fixed navigation with mobile hamburger menu and scroll shadow
- Hero section: tagline, CTA buttons, credential badges
- Philosophy section: The Soil Principle quote block + approach pillars
- Services grid: 6 cards (Landscape Diagnostics, Urban Tree Consulting, Regenerative Design, Construction & Development, Soil Health & Remediation, Ordinance & Grant Support)
- Client segments: 4 cards with engagement price ranges (Engineering Firms, Developers, Contractors, Property Owners & HOAs)
- TerraValue promotional banner with stats grid and launch link
- Credentials section: full ISA certifications, board positions, and awards
- Contact section: info + form (Name, Email, Role dropdown, Message)
- Footer with nav links and copyright

**TerraValue Product Page (terravalue.html)** — 611 lines, single-file HTML/CSS/JS:
- Product hero with badge row, mock results dashboard, and "Launch TerraValue" button (links to Vercel deployment)
- Elevator pitch section (3 paragraphs: what it does, why it's valuable, why only P&X could build it)
- "Who Is This For" section: 6 user personas (Homeowners, HOAs, Municipal Planners, Real Estate Professionals, Arborists, Developers)
- "How It Works" section: 4-step flow (Enter Address → Review & Refine → Get Results → Export & Share)
- "Six Ecosystem Services, Quantified" section: 6 cards with research citations
- "Only P&X Could Build This" section: 4 cards (Municipal Data Access, Peer-Reviewed Science, Canopy Study Author, Arboricultural Credibility)
- Connected Jurisdictions section: 8 cities + 2 counties + calculation sources
- CTA section with dual buttons
- Shared footer

### 2. Brand Design System
Both pages share a consistent design language pulled from the P&X Partner Overview and Business Plan PDFs:
- **Colors:** Forest green (#2d5016) primary, cream (#faf8f5) background, gold (#b8960c) accent for awards, green-pale (#e8f0e2) for icon backgrounds
- **Typography:** Playfair Display (serif) for headings, Source Sans 3 for body
- **Patterns:** SVG texture overlays on dark sections, card-based layouts, subtle hover animations
- **Responsive:** Full mobile support with 640px/900px breakpoints, hamburger nav, stacked grids

### 3. TerraValue Elevator Pitch
The product page contains a complete elevator pitch woven across multiple sections. The three core arguments:

**Who should use it:** Property owners, HOAs, municipal planners, real estate professionals, arborists, and developers — anyone who needs to quantify the dollar value of ecosystem services rather than guess.

**Why it's valuable:** Translates peer-reviewed USDA/EPA science into property-specific annual dollar values across 6 ecosystem services. Connects to real-time public ArcGIS parcel data across 10 Georgia jurisdictions. Generates a branded PDF report. Scores properties on a 0-100 Soil Score stewardship index.

**Why P&X is the sole provider:** TerraValue is built on the same institutional knowledge, municipal ArcGIS data access, and USDA/EPA science that William uses as Sandy Springs' Urban Forester. No other private consultant has both the municipal-grade data pipeline and the arboricultural credentials (ISA Certified Arborist, Urban Forest Specialist, TRAQ, Credentialing Council member, author of the 43K-acre Sandy Springs Canopy Study) to make this tool credible.

---

## What Was Already In Place (From Previous Sessions)

### TerraValue App
- **Location:** `Claude-Work/terravalue/` (full Vite + React project)
- **Status:** Production-ready, Vercel deployment configured, GitHub repo live
- **Features:** Address geocoding, cascading ArcGIS parcel lookup (8 GA cities + 2 counties), 6 ecosystem service calculations, satellite map (Leaflet), Soil Score (0-100), dual GI methodology (EPA + Georgia Blue Book), tree inventory, PDF export, mobile responsive
- **Main file:** `terravalue/src/TerraValue.jsx` (2,473 lines)
- **Handoff doc:** `TerraValue - Session Handoff.md`

### P&X Business Documents
- **PX-Partner-Overview.pdf** — 1-page partner/client overview (services, credentials, client segments)
- **PX-Business-Plan.pdf** — 20-page business plan (executive summary, philosophy, services, target market, competitive advantage, business model, financials, growth strategy, legal structure, risk analysis)

### William's Professional Profile
- **Outputs/William Park - Profile.md** — Full working profile with The Soil Principle philosophy, writing style analysis, employment history, and future potential
- **Outputs/William Park - Session Summary.md** — Previous career planning session
- **Outputs/William Park - Target Roles.md** — Career pivot analysis
- **Outputs/William Park - 12 Month Plan.md** — Quarter-by-quarter positioning plan

---

## File Manifest

### P&X/ folder (the handoff package)
| File | What It Is |
|---|---|
| **PX-Session-Handoff.md** | This file — context for the next session |
| **PX-Partner-Overview.pdf** | 1-page client-facing partner overview |
| **PX-Business-Plan.pdf** | 20-page business plan (April 2026) |
| **website/index.html** | P&X homepage (798 lines, self-contained HTML/CSS/JS) |
| **website/terravalue.html** | TerraValue product page (611 lines, self-contained) |

### Related files elsewhere in workspace
| File | Location |
|---|---|
| **TerraValue app** | `Claude-Work/terravalue/` (full Vite + React project) |
| **TerraValue handoff** | `Claude-Work/TerraValue - Session Handoff.md` |
| **William's profile** | `Claude-Work/Outputs/William Park - Profile.md` |
| **Resume** | `Claude-Work/About Me/Resume William Park.docx` |
| **Working rules** | `Claude-Work/About Me/my rules.rtf` |

---

## What Comes Next

### Website — Short Term
1. **Deploy to phloemandxylem.com** — Static hosting (Vercel, Netlify, or traditional host). Both HTML files are self-contained with no build step required.
2. **Contact form backend** — Currently a static form. Needs Formspree, Netlify Forms, or similar to actually send messages.
3. **SEO optimization** — Meta tags are in place; need Open Graph images, structured data (LocalBusiness schema), and a sitemap.xml.
4. **Blog/content section** — The business plan calls for case studies and educational content for SEO. Need a blog template page.
5. **Case study pages** — Template for individual project writeups with before/after photos.

### Website — Medium Term
6. **Google Analytics / Plausible** — Traffic tracking to measure SEO performance
7. **Testimonials section** — Social proof from early clients
8. **Portfolio gallery** — Project photos with descriptions
9. **Service-specific landing pages** — For targeted SEO (e.g., "tree risk assessment Sandy Springs")

### TerraValue — Next Steps (from TerraValue handoff)
1. Real canopy data integration (NLCD layer)
2. Canopy Commons (neighborhood aggregation)
3. User accounts (save assessments)
4. Expand beyond Fulton/DeKalb to Cobb, Gwinnett, Cherokee
5. Code-split the bundle (~790 KB main chunk)

---

## About William (for Claude's context)

William Park is an Urban Forester & Sustainability Coordinator for the City of Sandy Springs, GA. B.Sc. Environmental Science (Emory). ISA Certified Arborist, Urban Forest Specialist, TRAQ. ISA Credentialing Council member. Georgia Arborist Association Board of Directors. Grand Award for Excellence in Urban Arboriculture (2024). Young & Upcoming Professional Award (2025). Authored the 2023 Sandy Springs Canopy Study (43K acres, $80M+ ecosystem services).

**P&X (Phloem & Xylem)** is his natural resource consulting firm — a part-time consultancy alongside his municipal role. Two-tier LLC (Wyoming holding + Georgia operating). Targets $25K-$75K Year 1 revenue. Key differentiator: public-sector institutional knowledge applied to private-sector consulting with a root-cause, soil-first diagnostic philosophy.

**The Soil Principle:** What's visible above ground depends entirely on what's happening below it. William works on root causes, not symptoms. This applies to forestry, to projects, to systems.

**Working rules:** Ask before starting. Ask where to save files. Ask for permission to share information. Think like him — be an extension of his philosophy, not a replacement for it.

---

**To continue in a new session:** Share this handoff file + the `P&X/` folder. For TerraValue work, also include the `terravalue/` folder and its handoff doc.
