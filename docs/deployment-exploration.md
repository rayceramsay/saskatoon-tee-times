# Deployment Exploration

Status: **exploration notes, not a commitment.** No OpenSpec change exists for any of this yet.
Captured: 2026-07-16.

Context: the system works end to end locally (scraper, dockerized DynamoDB, API, frontend).
This documents the thinking about how to get it live, so a future session can pick up without
re-deriving it. Section 2 records what was decided; section 3 is genuinely undecided.

## 1. Where the codebase actually stands

```
                LOCAL (works)                  PROD (missing)
                ─────────────                  ──────────────
  scraper   apps/scraper-local/main.ts    →   apps/scraper-lambda/  ⚠️ EMPTY STUB
            (~130 lines of wiring fused         (package.json only — no src,
             with node-cron scheduling)          no Dockerfile, no handler)

  api       apps/api/server.local.ts      →   no lambda handler, no build script
            (Hono + @hono/node-server)         (hono/aws-lambda needs no new dep)

  db        docker-compose dynamodb-local →   createDynamoDbClient({mode:'aws'})
            + ensureTeeTimeTable()             ✅ ALREADY EXISTS — table becomes
                                               OpenTofu's job

  web       next dev :3000                →   output: 'export' ✅ ready for S3

  infra     —                             →   no infra/, no .github/ at all
```

The persistence layer needs nothing: `dynamodb-client.factory.ts` already carries an `aws` mode
written for a Lambda execution role. The two real gaps are the empty `scraper-lambda` package and
the total absence of CI/IaC.

## 2. Decisions made in this session

### 2.1 Cost target relaxed to <$1/month

`$0/month` was not reachable. PRD NFR-4 and the success-metrics table were amended to
"under $1/month excluding domain."

```
  Route 53 hosted zone   $0.50   ← essentially the entire bill
  ACM certificate        $0
  CloudFront             $0      1 TB + 10M req always free
  Lambda                 $0      400k GB-s always free (~345k projected — see 4.2)
  DynamoDB               $0      25 RCU/WCU + 25 GB always free
  S3                     ~$0     a few MB of static export
  CloudWatch Logs        $0      5 GB ingestion always free
  ECR                    $0      ← disappears entirely if the sparticuz spike lands
                        ─────
                         ~$0.50/mo
```

Note the free-tier traps that shaped this: ECR's 500 MB and S3's 5 GB are **12-month** free tiers,
not always-free. Route 53's hosted-zone charge is never free.

### 2.2 DynamoDB: 25 provisioned RCU/WCU (not on-demand)

On-demand does not qualify for the always-free 25 RCU/WCU allowance. Provisioned at exactly 25/25
does.

This is safer than it first appears: `DynamoDbTeeTimeWriter.batchWrite` **already** retries
`UnprocessedItems` with exponential backoff (8 attempts, capped at 1s), and throttling under
provisioned capacity is exactly what DynamoDB signals via `UnprocessedItems`. The handling exists.

The number to watch: `replaceUnitTeeTimes` is snapshot-replace, so every tee time is rewritten
every 15 minutes regardless of whether it changed. Write volume scales with
`courses × days-ahead × slots`, not with churn. At ~2k items/run this fits inside burst capacity
with 15 idle minutes to refill. **Scraping further ahead is what would break this.**

### 2.3 Route 53 over Namecheap DNS

Registrar and DNS host are separate roles. Namecheap stays the registrar either way; this is only
about who answers queries. Route 53 means pointing Namecheap's nameservers at AWS and never
touching the registration again.

|                     | Namecheap DNS (free)                | Route 53 ($0.50/mo)      |
| ------------------- | ----------------------------------- | ------------------------ |
| Apex → CloudFront   | ALIAS record, works                 | ALIAS, queries free      |
| ACM cert validation | paste CNAMEs by hand                | OpenTofu creates + waits |
| Cert renewal        | works _if_ nobody deletes the CNAME | same, but IaC-tracked    |
| In OpenTofu         | ✗ — a manual step in a UI           | ✓ — one `tofu apply`     |
| NFR-5 "full IaC"    | violated                            | satisfied                |

Decided: **Route 53.** It satisfies NFR-5's promise that the full system is deployable via IaC, it
fits the <$1 budget, and `aws_acm_certificate_validation` — creating validation records and
blocking until the cert issues — is exactly the kind of AWS practice this project is partly for.

### 2.4 Scraper composition: one app, two entrypoints

**`apps/api` already solved this. `apps/scraper-*` didn't.**

```
  apps/api  ✅                          apps/scraper-*  ❌
  ─────────────                         ──────────────────
  app.ts                                scraper-local/main.ts
    └─ createApp({reader, ...})           └─ 130 lines of wiring AND
       ← pure factory, no runtime            node-cron scheduling, fused
                                             in one function
  server.local.ts
    └─ loadConfig, mode:'local',        scraper-lambda/
       serve(), SIGTERM                   └─ (empty — would have to
       ← ~35 lines of runtime glue           copy-paste those 130 lines)
```

`createApp()` knows nothing about how it's invoked; `server.local.ts` is a thin composition root
that picks a runtime. Adding Lambda to the API is ~15 lines (`loadConfig`, `mode:'aws'`,
`createApp`, `handle(app)`). **The API never needed a second package.**

The scraper needs the same surgery: extract a `createIngestionPipeline({ documentClient,
tableName, logger, limiterConfig })` factory — the `createApp()` of the scraper world — and leave
cron scheduling in the entrypoint.

The governing principle:

> **Package boundaries follow what changes together. Deployment target is a build-time choice —
> which entrypoint you bundle — not a package boundary.**

Applying the test: what makes you edit scraper composition? Adding a course. Does that change local
and prod identically? Yes, every time. CLAUDE.md already says "code that changes together lives
together." Two packages means every new course is registered twice, and the day they drift is the
day local passes while prod silently scrapes seven courses.

What genuinely differs is small and lives at the leaves:

```
  apps/scraper/                      ← rename scraper-local, delete scraper-lambda stub
  ├── src/
  │   ├── ingestion-pipeline.factory.ts   ← the ~100 shared lines
  │   ├── console-logger.adapter.ts
  │   ├── dynamodb-setup.ts               ← local-only bootstrap
  │   ├── config.local.ts                 ← ENDPOINT + SCRAPE_CRON
  │   ├── config.lambda.ts                ← TABLE_NAME, no cron
  │   ├── main.local.ts                   ← node-cron + SIGTERM
  │   └── handler.lambda.ts               ← export const handler
  └── Dockerfile                          ← only if the spike (3.1) says so
```

Resolved objection — "won't `node-cron` ship in the Lambda bundle?" No. esbuild traces imports from
the entrypoint; `handler.lambda.ts` never reaches `node-cron`, so it is never bundled. Runtime
divergence is the bundler's job.

**Browser lifecycle is the one real runtime difference.** Locally, `PlaywrightJsonFetcher` keeps the
browser warm across cron ticks — that is the point of its lazy `browserPromise`. In Lambda it must
`close()` before the invocation returns, or Chromium is frozen mid-flight and the next thaw
inherits dead sockets. Entrypoint-level concern, which is where it belongs.

## 3. Open questions

### 3.1 Spike: `@sparticuz/chromium` + `playwright-core` (highest priority)

Playwright-in-Lambda is the only thing here with a real chance of surprising us, and it needs no
AWS account to investigate — Docker plus the Lambda Runtime Interface Emulator is enough.

| Approach                                  | Image size | Notes                                 |
| ----------------------------------------- | ---------- | ------------------------------------- |
| Playwright base image + `aws-lambda-ric`  | ~1.5 GB    | PRD's implied path; RIC bolted on     |
| AWS Node base + manual Chromium deps      | ~1 GB      | Fiddly dependency hunting             |
| `@sparticuz/chromium` + `playwright-core` | ~50 MB     | **fits a zip — no ECR/Docker at all** |

The PRD commits to "Lambda Container + Docker + ECR," but `scraper-core` already depends on
`playwright-core` rather than `playwright` — exactly the setup sparticuz expects. **If this lands,
ECR and Docker leave the architecture entirely**, cold starts drop sharply, and the Lambda GB-s
projection (4.2) gets meaningfully safer.

Known code implication: `PlaywrightJsonFetcher` calls `chromium.launch()` with options baked in and
no constructor parameter. Sparticuz supplies an `executablePath` and a specific `args` array, so
launch options must become injectable. Small change, lands in `scraper-core`, and is
hexagonally correct regardless — an adapter shouldn't hardcode its own infrastructure config.

Unknowns the spike should settle:

- Does `playwright-core` drive a sparticuz Chromium build reliably? (sparticuz is primarily
  exercised against `puppeteer-core`.) The usage here is basic — navigate, read response body,
  capture network JSON — so the surface is small, but this is the core risk.
- Does the unpacked Chromium stay inside Lambda's 250 MB limit? (sparticuz ships a brotli archive
  and expands into `/tmp`, which has 512 MB.)
- Cold-start and memory numbers, to firm up 4.2.

### 3.2 `/api/*` path mismatch

`apps/api/src/app.ts` registers `GET /tee-times`. CloudFront is specced to route `/api/*` to the API
Lambda, so a request would arrive as `/api/tee-times` and 404. Needs a Hono `basePath`, a CloudFront
Function rewrite, or a path-pattern decision. Not yet decided.

Not a problem: `CORS_ORIGIN` is already nullable and defaults to `null` (disabled) precisely because
CloudFront makes the frontend same-origin with the API. Working as designed.

### 3.3 OpenTofu bootstrap is circular

The S3 state backend must exist before OpenTofu can run, and the GitHub OIDC role must exist before
CI can deploy. Standard solve is a one-time local apply with local state, then migrate — but this
should be a deliberate, documented step in the foundation change rather than something rediscovered
at 11pm.

## 4. Proposed phasing

The organizing principle is **code before infra**. The code gaps (empty `scraper-lambda`, no API
handler, no build scripts) are where the risk lives; the OpenTofu is comparatively rote — it's
Lambda-plus-IAM-plus-a-trigger, three times. Splitting by AWS service would front-load the easy part.

```
  PHASE 0  spike: sparticuz + playwright-core, locally (3.1)
           └── outcome decides: zip vs container, ECR or no ECR
                │
  PHASE 1  ├── refactor: injectable browser launch options (scraper-core)
           ├── consolidate scraper → apps/scraper, 2 entrypoints + factory (2.4)
           └── api lambda entrypoint (~15 lines + build script)
                │
  PHASE 2  ├── tofu foundation (state bucket, OIDC role — bootstrap dance, 3.3)
           └── dynamodb table (25 provisioned RCU/WCU, 2.2)
                │
  PHASE 3  ├── scraper infra (Lambda, EventBridge, IAM)
           ├── api infra (Lambda, Function URL, IAM)
           └── web hosting (S3, CloudFront, ACM, Route 53, NS cutover)
                │
  PHASE 4  CI/CD (GitHub Actions + OIDC)
                │
  PHASE 5  observability (NFR-6 zero-tee-times anomaly)
```

Phase 0 gates Phase 1's shape. Phase 1's consolidation is a prerequisite for a sane Phase 3.

### 4.2 The one tight budget line

Lambda's always-free 400k GB-s against a projected ~345k GB-s (2880 runs/mo × ~60s × 2 GB) leaves
only ~15% headroom. Raising scraper memory to 3 GB blows through it. Real cold-start and duration
numbers from the Phase 0 spike should replace this estimate — and if sparticuz lands, the improved
cold starts push the projection down.
