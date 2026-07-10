## 1. Rework the fetch path

- [ ] 1.1 In `packages/scraper-core/src/transport/playwright-json-fetcher.adapter.ts`, replace the `goto(origin)` + `evaluate(fetch(...))` flow with a direct `const response = await page.goto(url, { waitUntil: 'domcontentloaded' })`.
- [ ] 1.2 Read `status` from `response.status()` and `Retry-After` from `response.headers()['retry-after']`; on a retryable/non-OK status, throw `TransportError(status, parseRetryAfter(...), url)` (reuse the existing `parseRetryAfter`).
- [ ] 1.3 On an OK response, return the parsed body via `response.json()`, with a `JSON.parse(await response.text())` fallback if `.json()` is unavailable/unreliable for the rendered JSON document.
- [ ] 1.4 Treat a missing (`null`) navigation response as a transport failure rather than dereferencing it.
- [ ] 1.5 Update the adapter's doc comment to describe direct-navigation fingerprinting (drop the "load origin, then same-origin fetch" description).

## 2. Tests

- [ ] 2.1 Rework `playwright-json-fetcher.adapter.test.ts` to mock `page.goto` returning a response with `status()`, `headers()`, and `json()`/`text()`; assert an OK response returns the parsed JSON intact.
- [ ] 2.2 Assert a non-OK response with a `Retry-After` header rejects with a `TransportError` exposing the numeric `status` and parsed `retryAfterSeconds`.
- [ ] 2.3 Assert a non-OK response without `Retry-After` rejects with a `TransportError` carrying `status` and absent `retryAfterSeconds`.

## 3. Verify

- [ ] 3.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.
- [ ] 3.2 Run the scraper-core test suite (`pnpm test`) and confirm the transport tests pass.
- [ ] 3.3 Run a live Greenbryre scrape via `apps/scraper-local` and confirm the run completes in single-digit seconds with tee times persisted and no 429s.
- [ ] 3.4 Run `openspec validate speed-up-chronogolf-v1-direct-json-fetch --strict` and fix any issues.
