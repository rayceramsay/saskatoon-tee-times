# Saskatoon Tee Times

One dashboard for every public tee time in Saskatoon.

Saskatoon's eight public and semi-private courses book through four independent platforms (Webtrac, Chronogolf V1, Chronogolf V2, TeeOn). Finding an open slot means visiting each site separately, re-entering the same date, and tracking availability across tabs. This project scrapes all of them every 15 minutes, normalizes the results into one schema, and serves them through a single filterable dashboard with direct links back to each course's own booking system.

It is a search engine, not a booking engine — booking always happens on the course's own platform.

## Core features

- **Aggregation** — every course, every date within its booking window, refreshed on a 15-minute cadence
- **Search & filter** — by date, course, earliest start time, hole count, and group size
- **Direct booking links** — deep-linked to the slot and group size where the platform allows it, falling back to the course portal
- **Freshness indicator** — the dashboard shows when the data was last updated
- **Shareable URLs** — filter state is encoded in the URL

Courses covered: Holiday Park Championship 18, Holiday Park Executive 9, Wildwood, Silverwood, The Willows, Greenbryre, Dakota Dunes, The Legends (Warman).

See [`docs/prd.md`](docs/prd.md) for the full product and architecture spec.

## Table of Contents

- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Tests](#tests)
- [Credits](#credits)

## Repository Layout

pnpm workspaces + Turborepo. Applications are composition roots; packages hold the domain and the reusable adapters.

| Workspace                       | Purpose                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/scraper`                  | Scraper runtime — wires the ingestion pipeline and drives it on an in-process cron schedule locally |
| `apps/api`                      | Hono API serving `GET /api/tee-times`                                                               |
| `apps/web`                      | Next.js dashboard (static export) with TailwindCSS and SWR                                          |
| `packages/tee-time-domain`      | Canonical tee time schema, course config, and the ports the adapters implement                      |
| `packages/scraper-core`         | Per-platform scraper adapters, per-course configs, transports, and the pricing engine               |
| `packages/tee-time-persistence` | DynamoDB reader/writer adapters and table definition                                                |
| `packages/configs/*`            | Shared ESLint, Prettier, TypeScript, and Vitest configs                                             |

Scrapers are abstracted at the **platform** layer, not the course layer: one adapter per booking platform, with each course as a configuration object passed into it. Adding a course on an existing platform is a config change, not a code change.

## Prerequisites

| Requirement | Version               | Notes                                                                                                         |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Node.js     | 22+ (developed on 26) | The dev scripts use `--env-file-if-exists`, which needs 22+                                                   |
| pnpm        | 9.0.0                 | Pinned via `packageManager`; `corepack enable` will honour it                                                 |
| Docker      | any recent version    | Runs DynamoDB Local and the Testcontainers-based integration tests                                            |
| Chromium    | Playwright build      | Some platforms are browser-driven; the repo depends on `playwright-core`, which does **not** bundle a browser |

Install the Chromium build Playwright expects:

```bash
pnpm dlx playwright install chromium
```

## Installation

```bash
git clone git@github.com:rayceramsay/saskatoon-tee-times.git
cd saskatoon-tee-times
pnpm install
```

Copy the example env files for each app (see [Configuration](#configuration) for what the values mean):

```bash
cp apps/scraper/.env.example apps/scraper/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start DynamoDB Local:

```bash
docker compose up -d
```

The scraper creates the local table on startup, so no manual table provisioning is needed.

## Usage

Run everything at once from the repo root:

```bash
pnpm dev
```

That starts the scraper (cron-scheduled ingestion), the API on `http://localhost:8787`, and the dashboard on `http://localhost:3000`.

To run a single app, use the workspace filter:

```bash
pnpm --filter scraper dev   # ingestion only
pnpm --filter api dev       # API only
pnpm --filter web dev       # dashboard only
```

Query the API directly:

```bash
curl 'http://localhost:8787/api/tee-times?date=2026-08-04'
```

```json
{
  "date": "2026-08-04",
  "lastUpdatedAt": "2026-08-03T12:45:00Z",
  "teeTimes": [
    {
      "startInstant": "2026-08-04T07:30:00-06:00",
      "courseId": "the-legends",
      "courseName": "The Legends",
      "holes": 18,
      "routing": ["Front", "Back"],
      "groupSizes": [2, 3, 4],
      "pricePerPlayer": 47.0,
      "booking": { "kind": "portal", "url": "https://..." },
      "scrapedAt": "2026-08-03T12:45:00Z"
    }
  ]
}
```

Other root scripts:

```bash
pnpm build          # build all workspaces
pnpm format         # Prettier write
pnpm check-types    # tsc --noEmit across workspaces
pnpm lint           # ESLint across workspaces
```

## Configuration

Each app loads its own `.env` through a Zod schema and fails loudly at startup if a value is missing or malformed. There are no implicit defaults for anything environment-specific.

### `apps/scraper/.env`

| Variable                          | Example                 | Purpose                                                             |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `DYNAMODB_ENDPOINT`               | `http://localhost:8000` | DynamoDB Local endpoint; omitted in production                      |
| `DYNAMODB_TABLE_NAME`             | `tee-times-local`       | Target table                                                        |
| `SCRAPE_CRON`                     | `*/15 * * * *`          | In-process schedule (production uses EventBridge Scheduler)         |
| `SCRAPER_GLOBAL_MAX_CONCURRENT`   | `100`                   | Global in-flight request ceiling                                    |
| `SCRAPER_PER_HOST_MAX_CONCURRENT` | `25`                    | Per-host in-flight request ceiling                                  |
| `SCRAPER_MAX_RETRY_ATTEMPTS`      | `2`                     | Retries for HTTP 429/503 only; other failures wait for the next run |
| `SCRAPER_MAX_RETRY_AFTER_SECONDS` | `30`                    | Upper bound honoured on a `Retry-After` header                      |
| `LOG_LEVEL`                       | `info`                  | Log verbosity                                                       |

### `apps/api/.env`

| Variable               | Example                 | Purpose                                                       |
| ---------------------- | ----------------------- | ------------------------------------------------------------- |
| `PORT`                 | `8787`                  | Local HTTP server port                                        |
| `DYNAMODB_ENDPOINT`    | `http://localhost:8000` | DynamoDB Local endpoint; omitted in production                |
| `DYNAMODB_TABLE_NAME`  | `tee-times-local`       | Source table                                                  |
| `CORS_ORIGIN`          | `http://localhost:3000` | Allowed origin; unset disables CORS middleware                |
| `LOG_LEVEL`            | `info`                  | Log verbosity                                                 |
| `EXPOSE_ERROR_DETAILS` | `false`                 | Include error message and stack in 500 responses — local only |

### `apps/web/.env`

| Variable                   | Example                     | Purpose                                                      |
| -------------------------- | --------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8787/api` | API base; in production this is the CloudFront `/api` origin |

No API keys or credentials are required for local development. In production the Lambdas reach DynamoDB through their IAM execution roles rather than static credentials.

## Tests

Unit tests (Vitest) across every workspace:

```bash
pnpm test
```

Integration tests spin up real DynamoDB via Testcontainers, so Docker must be running:

```bash
pnpm test:integration
```

Scope to one workspace with a filter:

```bash
pnpm --filter @stt/scraper-core test
pnpm --filter web test
```

## Credits

Built and maintained by **Rayce Ramsay** ([@rayceramsay](https://github.com/rayceramsay)).

Issues and questions: <https://github.com/rayceramsay/saskatoon-tee-times/issues>

Tee time data is scraped from each course's own public booking platform. This project is not affiliated with, endorsed by, or operated by any of the courses or booking providers listed.
