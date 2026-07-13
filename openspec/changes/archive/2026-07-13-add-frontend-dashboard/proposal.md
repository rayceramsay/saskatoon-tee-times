## Why

The ingestion pipeline, persistence, and read API are in place, but there is no user-facing surface — the `web` app is a bare Next.js skeleton. This change delivers the product's entire reason to exist (PRD F2–F5): a single page where a Saskatoon golfer opens one URL, sees the day's available tee times across all courses, filters them, and clicks through to book. The UX is already fully designed in this change's `ux-planning/` reference folder (DESIGN.md, EXPERIENCE.md, and two HTML mockups under `.working/`); this change implements it against the live API.

## What Changes

- Build the single-surface, zero-routing tee time dashboard in `apps/web`: one page whose complete view state lives in URL query params (`date`, `holes`, `players`, `from`, `courses`, `group`).
- **One network fetch per date** via `GET /api/tee-times?date=YYYY-MM-DD` (SWR); course/holes/players/earliest-start/group-by-course are all instant client-side transforms over the fetched day.
- Two first-class responsive layouts sharing one component tree, switched by CSS at the `md` (768px) breakpoint: desktop = 264px filter sidebar + scrollable listings table; mobile = full-screen list + bottom-sheet filters.
- Course filter is **data-driven** from the day's results — Moon Lake (in the mockups but out of PRD v1 scope) is excluded automatically, no hardcoded course list.
- Freshness indicator, loading skeletons, and empty/error/stale state cards per the design's state matrix.
- Phone-only slots (`onlineBookable: false`) render a subtle **"Call to book"** text label in place of the green Book button — a designed state the mockups did not cover.
- Adopt the intended-but-not-yet-installed stack: **TailwindCSS v4** (design tokens mapped into `@theme`; rem-based sizing, px hairlines) and **SWR**.
- Configurable API base URL via a validated `NEXT_PUBLIC_*` env var (prod `/api/*` CloudFront origin; local API on its own port).
- "Today" and the past-slot cutoff anchor to the course-local timezone (America/Regina), not the visitor's clock.

### Resolved source-material conflicts

- **API is schema of record.** Consume the live API shape `{ date, teeTimes, lastUpdatedAt }` — not the PRD's prose field names. No API change is made in this change.
- **Freshness uses `lastUpdatedAt` (max `scrapedAt`).** This supersedes the DESIGN.md "minimum / freshness floor" language; the three dot states (green <20m, amber 20–60m, red >60m) are computed off the max.
- **Accent is forest green `#2e6b47` everywhere.** The desktop mockup's charcoal Book button/toggles are stale (noted inline in that file); the mobile mockup and DESIGN.md are authoritative on color.

## Capabilities

### New Capabilities

- `tee-time-dashboard`: The web frontend — a single-surface, URL-state-driven browser that fetches a day's tee times, applies client-side filtering/sorting/grouping, and renders responsive desktop and mobile layouts with booking links and a data-freshness indicator.

### Modified Capabilities

<!-- None. This change consumes the existing tee-time-api contract as-is; no API requirements change. -->

## Impact

- **`apps/web`**: net-new application code — the dashboard page, components, client-side filter/sort/group logic, SWR data layer, URL-state sync, and Tailwind v4 token setup. Adds `tailwindcss`, `swr`, and a Zod-validated client config; `next.config.js` stays `output: 'export'`.
- **API / backend**: none. `GET /api/tee-times` is consumed unchanged.
- **Consumes**: the `TeeTime` shape from `@stt/tee-time-domain` (`startInstant`, `courseId`, `courseName`, `holes`, `routing`, `groupSizes`, `bookingUrls`, `onlineBookable`, `pricePerPlayer`, `scrapedAt`) as the contract for API responses.
- **Deployment (out of scope here, noted for later)**: S3 + CloudFront hosting and the `/api/*` origin are IaC concerns handled in a separate infrastructure change.
