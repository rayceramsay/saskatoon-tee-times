# PRD: Saskatoon Tee Times

## 1. Problem Statement

Public golfers in Saskatoon have no single place to find available tee times. Eight public courses operate across four independent booking platforms (Webtrac, Chronogolf, TeeOn, CPS Golf), each with its own interface, search flow, and booking logic. Finding an open slot on a given day means visiting each site separately: opening multiple tabs, re-entering the same date, and mentally tracking availability across platforms. The cost is real — wasted time and low-grade frustration on a hobby that should be frictionless.

## 2. Vision & Goals

**Vision:** Any Saskatoon public golfer can open one page, see what's available today, and get to booking in a single click. Saskatoon Tee Times is a search engine, not a booking engine — it surfaces availability and routes users to the course's own platform to complete the reservation.

**Product Goal:** Aggregate tee time availability across all 8 public Saskatoon-area courses into one filterable dashboard — refreshed every 15 minutes — with direct booking links to each course's own reservation system.

**Future extensibility:** The system is designed to be extensible — adding a new course should not require a rewrite. If the product finds an audience, the same pattern could extend to other Saskatchewan cities or a multi-city golf aggregator. That is a future problem; v1 is Saskatoon public courses.

## 3. Who This Serves

**Primary — Recreational public golfers in Saskatoon:** People without a private club membership who book at municipal and semi-private courses. They want flexibility across courses but currently pay for it in friction: visiting each booking site manually to find availability.

**Secondary — Groups and families coordinating tee times:** Two or more people who need to match availability for a specific date and group size, currently forced to cross-reference multiple portals.

No account, login, or prior relationship with the product required. Anyone who can search "saskatoon tee times" is a valid user.

## 4. Features

| ID  | Feature                       | Summary                                                                       |
| --- | ----------------------------- | ----------------------------------------------------------------------------- |
| F1  | Tee Time Aggregation          | Scrape all 8 courses every 15 minutes and normalize into a unified data store |
| F2  | Search & Filter Dashboard     | Display available tee times for the current day with user-controlled filters  |
| F3  | Direct Booking Links          | Route users as close to checkout as possible on the course's own platform     |
| F4  | Data Freshness Indicator      | Surface when data was last updated so users understand staleness risk         |
| F5  | Shareable / Bookmarkable URLs | Encode active filters in the URL for sharing and returning to a search        |

## 5. Functional Requirements

### F1 — Tee Time Aggregation

**FR-1.1** The system shall scrape tee time availability for all 8 in-scope courses across every date within each course's booking window, every 15 minutes.

**FR-1.2** Each scraped tee time shall be normalized to a canonical schema containing: start datetime (local time with UTC offset), course name, number of holes, course routing (ordered set names if known, null otherwise), an explicit array of valid group sizes (not assumed contiguous — e.g. `[2,3,4]` when a course disallows a smaller group on an otherwise-available slot), price per adult player (after-tax CAD; null if unavailable), and a booking URL for each valid group size.

**FR-1.3** The scraper shall respect each course's booking window — the number of days ahead that are bookable, and the time of day new dates are released. Dates outside a course's booking window shall not be scraped. Per-course booking windows are documented in the addendum.

**FR-1.4** Tee times whose start datetime has passed shall be removed from the data store.

**FR-1.5** A scrape failure for one course shall not prevent scrapes for other courses from completing (failure isolation per course).

**FR-1.6** When a scrape request receives an HTTP 429 or 503 response, the system shall back off and retry that specific request within the same run. All other failure types (network error, parse failure, unexpected response) shall not be retried within the run; they will be resolved on the next scheduled scrape.

**FR-1.7** Tee time pricing shall be resolved in priority order: (1) dynamically scraped price from the booking platform; (2) statically configured pricing rules for the course (time- and date-based); (3) null — no price is displayed.

**FR-1.8** The booking URL for each tee time shall target the correct group size: matching the active players filter, or the maximum available group size if no players filter is applied. The URL shall be the most direct link available: tee time checkout page → course portal pre-filtered to the correct date → general course booking portal.

### F2 — Search & Filter Dashboard

**FR-2.1** On load, the dashboard shall display all available tee times for the current date with default filters (all courses, no start time restriction, any holes, any group size).

**FR-2.2** The user shall be able to filter displayed tee times by: date, course (multi-select), earliest start time, number of holes (supporting all valid counts across in-scope courses: 6, 9, 12, 18), and group size — showing only tee times whose valid group sizes include the selected value (a membership check, not a "≤ the slot's maximum" comparison).

**FR-2.3** Tee times shall be displayed in chronological order by default. The user shall be able to optionally group results by course.

**FR-2.4** Tee times with a start datetime earlier than the current time shall not be displayed.

### F3 — Direct Booking Links

**FR-3.1** Each displayed tee time shall include a booking link that navigates the user to the course's own platform, at the most direct URL available (per FR-1.8).

**FR-3.2** The system shall not perform booking on behalf of the user. The booking link always opens the course's own platform.

### F4 — Data Freshness Indicator

**FR-4.1** The dashboard shall display the timestamp of the most recent successful data update.

**FR-4.2** The system shall not represent tee time data as live or real-time; it is periodically refreshed and may be up to ~15 minutes stale.

### F5 — Shareable URLs

**FR-5.1** The URL shall encode the user's active filter state (date, course(s), start time, holes, group size). Navigating to a URL with encoded filters shall restore that filter state on load.

## 6. Non-Functional Requirements

**NFR-1 — Scrape cadence:** The ingestion pipeline shall run every 15 minutes, continuously, across all dates within each course's booking window.

**NFR-2 — Failure isolation:** A scrape failure for one course shall not cascade to other courses. Each course's scraper runs independently; a failure in one produces a log entry and moves on.

**NFR-3 — Rate limit handling:** When the scraper receives HTTP 429 or 503, it shall back off and retry that request within the same run. All other error types are not retried in-run.

**NFR-4 — Infrastructure cost:** The system shall operate under $1/month at v1 usage levels, excluding domain registration. Compute and storage shall stay within AWS Always Free Tier limits; the Route 53 hosted zone (~$0.50/month) is the one accepted always-billed line item, taken so that DNS and certificate issuance stay fully under IaC (NFR-5).

**NFR-5 — Deployability:** The full system shall be deployable and torn down via IaC (OpenTofu), with infrastructure state managed remotely (S3 backend). Deployments shall be automated via CI/CD (GitHub Actions with OIDC — no long-lived AWS credentials in CI).

**NFR-6 — Observability:** The system shall emit logs and metrics to AWS CloudWatch sufficient to detect scraper failures, API errors, and silent scraper breakage (e.g., a course returning zero tee times across multiple consecutive runs should surface as an anomaly, not silently pass).

## 7. Constraints & Scope

### In Scope — v1

- 8 public Saskatoon-area courses: Holiday Park Championship 18, Holiday Park Executive 9, Wildwood, Silverwood, The Willows, Greenbryre, Dakota Dunes, The Legends (Warman)
- Booking platforms: Webtrac (City of Saskatoon courses), Chronogolf V1 (Greenbryre, Dakota Dunes), Chronogolf V2 (The Willows), TeeOn (The Legends)
- Web dashboard at `saskatoonteetimes.ca`
- AWS serverless deployment: Lambda, DynamoDB, CloudFront, S3, EventBridge Scheduler, CloudWatch
- IaC via OpenTofu; CI/CD via GitHub Actions (public repo) with OIDC

### Out of Scope — v1

- Moon Lake Golf Course (scraping complexity; deferred to future iteration)
- In-app booking or payment processing
- Live / on-demand data refresh
- User accounts, saved preferences, or push notifications
- Courses outside the Saskatoon area
- Monetization — Google Ads is the designated path if traffic warrants it in a future iteration, and the v1 product design should not preclude it; no revenue target for v1

## 8. Success Metrics

| Metric              | Target                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| Course coverage     | All 8 in-scope courses returning data successfully                               |
| Scrape reliability  | 15-minute cadence maintained; failures surface in CloudWatch                     |
| Personal adoption   | Rayce and group use it as primary tee time finder through golf season            |
| Infrastructure cost | Under $1/month excluding domain; compute and storage within AWS Always Free Tier |
| Code quality        | Codebase is readable, structured, and something the author is proud to return to |

**Counter-metric — Acceptable staleness:** A tee time shown as available that has since been booked is an expected and acceptable state. The system communicates this via the freshness indicator (FR-4.1–4.2) and does not attempt to eliminate it in v1.

## 9. Addendum

Technical depth and design decisions that are architecture or implementation specific, rather than product focused.

### Technology Stack

#### Application

Note: the following technologies do not have to strictly be everything that is included; I am open to other libraries/technologies as needed. Treat this as preliminary assessment.

| Layer    | Technologies                                          |
| -------- | ----------------------------------------------------- |
| Scrapers | TypeScript, `fetch`, Cheerio, Playwright, Zod         |
| API      | TypeScript, Node.js, Hono                             |
| Frontend | TypeScript, Next.js (static export), TailwindCSS, SWR |
| Database | AWS DynamoDB                                          |
| Testing  | Vitest                                                |

#### Infrastructure & Deployment

| Concern            | Technology                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| Scraper runtime    | AWS Lambda Container + Docker + ECR                                    |
| Scraper scheduling | prod: AWS EventBridge Scheduler (every 15 min); local: in-process cron |
| API runtime        | AWS Lambda with Function URL                                           |
| Frontend hosting   | AWS S3 + CloudFront                                                    |
| API routing        | Second CloudFront origin at `/api/*` → API Lambda Function URL         |
| IaC                | OpenTofu, remote state via S3                                          |
| CI/CD              | GitHub Actions (public repo) with OIDC — no long-lived AWS credentials |
| Observability      | AWS CloudWatch                                                         |
| Domain registrar   | Namecheap (`saskatoonteetimes.ca`)                                     |

### Scraper Architecture: Platform Abstraction

Most courses outsource booking to third-party platforms. Multiple courses share platforms, so scrapers are abstracted at the **platform layer**, not the course layer. A standard scraper interface is implemented once per platform; individual courses are configurations passed to their platform's adapter.

**Platforms and courses:**

- Webtrac: Holiday Park Championship 18, Holiday Park Executive 9, Wildwood, Silverwood
- Chronogolf V1: Greenbryre, Dakota Dunes
- Chronogolf V2: The Willows
- TeeOn: The Legends (Warman)

Adding a new course on an existing platform is a configuration change, not a code change.

### Per-Course Booking Windows & Portal URLs

| Course                       | Window       | Opens At            | Booking Portal URL                                                                                                          |
| ---------------------------- | ------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Holiday Park Championship 18 | 7 days ahead | 6:00 AM             | https://leisure.saskatoon.ca/webtrac/web/search.html?display=Listing&InterfaceParameter=WebTrac_1&module=GR&secondarycode=1 |
| Holiday Park Executive 9     | 7 days ahead | 6:00 AM             | https://leisure.saskatoon.ca/webtrac/web/search.html?display=Listing&InterfaceParameter=WebTrac_1&module=GR&secondarycode=2 |
| Wildwood                     | 7 days ahead | 6:00 AM             | https://leisure.saskatoon.ca/webtrac/web/search.html?display=Listing&InterfaceParameter=WebTrac_1&module=GR&secondarycode=4 |
| Silverwood                   | 7 days ahead | 6:00 AM             | https://leisure.saskatoon.ca/webtrac/web/search.html?display=Listing&InterfaceParameter=WebTrac_1&module=GR&secondarycode=3 |
| The Willows                  | 5 days ahead | 7:00 AM             | https://www.chronogolf.com/club/the-willows-golf-country-club-saskatchewan-saskatoon                                        |
| Greenbryre                   | 7 days ahead | 6:00 AM             | https://greenbryre.com/book-a-tee-time/                                                                                     |
| Dakota Dunes                 | 7 days ahead | 12:00 AM (midnight) | https://golf.dakotadunesresort.com/book-tee-time/                                                                           |
| The Legends (Warman)         | 5 days ahead | 6:00 AM             | https://admin.teeon.com/portal/thelegendsgolfclub/teetimes/thelegendsgolfclub                                               |

_Note: The Webtrac/City portal URLs require their query params (`display`, `InterfaceParameter`, `module`) to load; the per-course `secondarycode` default-filters the portal to that course. Don't strip them to a bare `search.html`._

### Per-Course Routing Set Names

These are the canonical set names to use in the `routing` field of the tee time schema (FR-1.2).

| Course                       | Sets                 | Notes                                                                                           |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| Holiday Park Championship 18 | Front, Back          | 18 or 9 holes                                                                                   |
| Holiday Park Executive 9     | _(single set)_       | 9 holes only                                                                                    |
| Wildwood                     | Front, Back          | 18 or 9 holes                                                                                   |
| Silverwood                   | Front, Back          | 18 or 9 holes                                                                                   |
| The Willows                  | Bridges, Lakes, Xena | 18 holes (2 of 3 sets, or same set twice) or 9 holes (1 set)                                    |
| Greenbryre                   | South, North         | 12 or 6 holes (plus a North-only 6-hole early-bird listing under a separate internal course id) |
| Dakota Dunes                 | Front, Back          | 18 or 9 holes                                                                                   |
| The Legends (Warman)         | Front, Back          | 18 or 9 holes                                                                                   |

### Pricing Engine

Platforms vary in whether they provide dynamic pricing at scrape time.

**Resolution order (see PRD FR-1.7):**

1. **Dynamic price** — scraped directly from the platform response (may or may not include tax)
2. **Static pricing rules** — per-course configuration encoding time/date-based rules. The pricing engine evaluates a tee time's datetime against configured rules.
3. **Null** — no price displayed

Static pricing rules need to accommodate: weekday vs. weekend differentiation, multi-tier weekday pricing (Mon / Tue–Thu / Fri), time of day (e.g.,. cheaper price after 5pm, cheaper price before 7am, more expensive between 11am and 3pm, etc.), and holiday surcharges (e.g., Canada Day).

### Booking URL / Deep Link Strategy

Reservation links are often group-size-specific (e.g., a query parameter controls player count). Three options considered:

1. Store one general booking URL per tee time; dynamically mutate the group-size parameter at query time on the server.
2. Store one booking URL per valid group size per tee time; serve the correct one based on the players filter.
3. Store all per-group-size URLs; send all to the client; let the client pick.

Leaning towards option 3 to keep the API dumb (i.e., it just serves whatever is in the data store; lets the scraper determine the URLs)

### Group Size Determination

Platforms vary in how they expose valid group sizes:

- Some provide explicit min/max group size attributes per tee time
- Some require querying with each specific group size to determine availability (N queries per tee time)
- Some provide only a max group size

Context-dependent rules exist at some courses (e.g., singles can only book partially-filled tee times; doubles only within N hours of start on empty tee times). These should be determinable at scrape time per platform without a generalized booking-rule engine.

### API Contract Reference

#### `GET /api/tee-times`

**Query parameters:**

- `date` — Target date

**Response:**

Responses should return a `lastUpdated` field indicating maximum `scrapedAt` value across the day's set, a `date` field with the target date, and an array of tee time objects matching the schema below:

```json
{
  "startInstant": "2026-07-01T07:30:00-06:00",
  "courseId": "the-legends",
  "courseName": "The Legends",
  "holes": 18,
  "routing": ["Front", "Back"],
  "groupSizes": [2, 3, 4],
  "pricePerPlayer": 47.0,
  "bookingUrls": {
    "2": "https://...",
    "3": "https://...",
    "4": "https://..."
  },
  "scrapedAt": "2026-07-01T12:45:00Z"
}
```

_startDatetime is explicitly in ISO 8601 date and time format with time zone offset; calendar date and time should always be local to the course (never UTC); although all the courses are in America/Regina timezone, we should not assume this timezone as future courses might be in a different one_

_`pricePerPlayer` is null if unavailable. `routing` is an empty array when unknown._

_All filtering, sorting, grouping, and pagination are **client-side** view state in the URL._

### System Flows

#### Tee Time Ingestion

1. EventBridge Scheduler triggers Lambda every 15 minutes
2. Lambda runs platform adapters in parallel per course
3. Each adapter scrapes its platform, normalizes to canonical schema
4. Normalized tee times are upserted to DynamoDB; expired times are pruned

#### Tee Time Search

1. User loads `saskatoonteetimes.ca`
2. Frontend queries `GET /api/tee-times` with current date
3. API Lambda queries DynamoDB and returns matching tee times
4. User adjusts date filter → repeat steps 2–3

### Moon Lake — Deferred Research

Moon Lake is out of scope for v1 (scraping complexity). Research captured for future iteration:

- 3 sets of 9 holes: Moors, Highlands, Heather
- Tee times for 18 holes (2 of 3 sets, or same set twice) or 9 holes (1 set)
- Booking window: 10 days ahead (release time unknown)
- Platform: CPS Golf
- Portal URL: https://moonlake.cps.golf/onlineresweb/search-teetime?TeeOffTimeMin=0&TeeOffTimeMax=23
