## 1. Dependency & configuration

- [x] 1.1 Add `bottleneck` to `packages/scraper-core` dependencies and install
- [x] 1.2 Define the limiter config shape (Zod): `perHost` (default cap + optional per-host overrides keyed by hostname), `browserPageCeiling` from `SCRAPER_MAX_BROWSER_PAGES` (fail loud if unset), and `retry` (`maxAttempts`, `maxRetryAfterSeconds`), following the repo's env-config style
- [x] 1.3 Encode seed values as defaults where appropriate (per-host `maxConcurrent` 3, `maxRetryAfterSeconds` 30) but keep `browserPageCeiling` required/fail-loud

## 2. Structured transport error

- [x] 2.1 Define a typed transport error carrying `{ status, retryAfterSeconds }` in `transport/`
- [x] 2.2 In `playwright-json-fetcher.adapter.ts`, read `response.status` and `response.headers.get('retry-after')` inside the in-page fetch and throw the typed error so status + retry-after survive the `page.evaluate` boundary
- [x] 2.3 Add an `isRetryable(error)` predicate (429/503) and a retry-after/backoff wait computation helper

## 3. Request limiter port & adapter

- [x] 3.1 Define the limiter port in `transport/` exposing a `schedule(host, fn)`-style surface (no `bottleneck` types in the port)
- [x] 3.2 Implement the `bottleneck`-backed adapter: `Bottleneck.Group` keyed by hostname (Axis A) with per-host `maxConcurrent` from config
- [x] 3.3 Add the global parent `Bottleneck` (Axis B) with `maxConcurrent = browserPageCeiling`; chain each child via the Group `created` hook (verify the exact event name/signature against the library)
- [x] 3.4 Implement the `failed` handler: retry the failing job honoring `retryAfterSeconds`/backoff up to `maxAttempts`; give up (no pause) when non-retryable, attempts exhausted, or wait exceeds `maxRetryAfterSeconds`
- [x] 3.5 Implement the pause coordinator (`pauseHost`): reservoir `0` to pause / `null` to resume via `group.key(host)`, deduping and extending (not stacking) the window to the latest `resumeAt`; make the handler async and await `updateSettings`
- [x] 3.6 Ensure `bottleneck` does not leak past the adapter file

## 4. Host-limited fetcher decorator

- [x] 4.1 Implement `HostLimitedJsonFetcher implements JsonFetcher`: derive host from `new URL(url).host`, delegate through `limiter.schedule(host, () => inner.fetchJson(url))`
- [x] 4.2 Add package.json `exports` entries for the decorator and limiter wiring

## 5. Wiring

- [x] 5.1 In `apps/scraper-local/src/main.ts`, construct the limiter from config and wrap `PlaywrightJsonFetcher` in `HostLimitedJsonFetcher`
- [x] 5.2 Thread the new limiter config through the scraper-local config surface

## 6. Tests

- [x] 6.1 Limiter caps concurrency per-host (same host shares a budget; different hosts independent)
- [x] 6.2 Limiter enforces the global page ceiling and shows no head-of-line blocking (free host not starved behind a busy host)
- [x] 6.3 Retry honors a within-threshold Retry-After, ignores/gives up over threshold and on exhausted attempts, and does not retry non-retryable errors
- [x] 6.4 A 429 pauses only its host (others keep flowing) and the host resumes at `resumeAt`; concurrent pauses extend rather than stack
- [x] 6.5 Structured transport error exposes `status` and `retryAfterSeconds` (with and without the header)
- [x] 6.6 Decorator derives host from the URL and delegates through the limiter, returning the inner result unchanged

## 7. Verification

- [ ] 7.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
- [ ] 7.2 Run the local scraper against the live course and confirm bounded concurrency (no laptop freeze / 30s timeout burst)
