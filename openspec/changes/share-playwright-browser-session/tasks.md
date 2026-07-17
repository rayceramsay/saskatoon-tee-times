## 1. Browser session

- [ ] 1.1 Add `playwright-browser-session.ts` to `packages/scraper-core/src/transport` with a class that owns the Chromium browser and one context, exposing page acquisition plus a single `close()` releasing context then browser
- [ ] 1.2 Launch the session explicitly via a static async factory rather than lazily on first page acquisition, so an unavailable Chromium fails at startup
- [ ] 1.3 Centralize the `headless: true` launch arguments in the session as the single home for the flags the Lambda handler will later need
- [ ] 1.4 Export the session as `./transport/playwright-browser-session` in `packages/scraper-core/package.json`
- [ ] 1.5 Add unit tests covering: page acquisition yields a page from the shared context; `close()` releases context and browser; repeated acquisitions reuse one browser and context

## 2. Convert the browser JSON fetcher

- [ ] 2.1 Change `PlaywrightJsonFetcher` to take a session via constructor injection, removing `browserPromise`, `contextPromise`, the private `browser()`/`context()` helpers, and `close()`
- [ ] 2.2 Acquire the page from the session in `fetchJson`, keeping the existing `finally { page.close() }` discipline and leaving navigation, `TransportError`, and `parseRetryAfter` logic untouched
- [ ] 2.3 Update the class JSDoc to state that the session is injected and externally owned, replacing the "launched lazily and shared across calls; call close" paragraph
- [ ] 2.4 Rework `playwright-json-fetcher.adapter.test.ts` to inject a fake session yielding a stub `Page`, dropping `vi.mock('playwright-core')` and the `launch → browser → context → page` wiring
- [ ] 2.5 Confirm the existing behavioral tests still pass unchanged in intent: parsed JSON body returned, `null` navigation response, non-OK status with and without `Retry-After`, page closed on both success and throw

## 3. Convert the captured JSON fetcher

- [ ] 3.1 Change `PlaywrightCapturedJsonFetcher` to take a session via constructor injection, removing its identical lifecycle block and `close()`
- [ ] 3.2 Acquire the page from the session in `capture`, preserving waiter-registration-before-`goto` ordering and the `finally { page.close() }` discipline
- [ ] 3.3 Update the class JSDoc's lifecycle paragraph to match the injected-session model
- [ ] 3.4 Rework `playwright-captured-json-fetcher.adapter.test.ts` to inject a fake session, dropping the module mock
- [ ] 3.5 Confirm the captured-transport behaviors still hold: multiple bodies keyed by label, single target, non-OK captured response yielding `TransportError`

## 4. Rewire the local composition root

- [ ] 4.1 Launch one session in `apps/scraper-local/src/main.ts` before wiring, and inject it into both `PlaywrightJsonFetcher` and `PlaywrightCapturedJsonFetcher`
- [ ] 4.2 Replace the `fetcher`/`capturedFetcher` concrete-type parameters on `setupAndStartIngestionPipelineCronSchedule` with the session, so the composition root no longer holds adapter types just to shut them down
- [ ] 4.3 Close the session once in the SIGINT/SIGTERM shutdown path, replacing the `Promise.all([fetcher.close(), capturedFetcher.close()])` pair
- [ ] 4.4 Confirm the comment about `browserLimiter` modeling concurrent pages across browser-driven scrapers still reads true against the shared session

## 5. Verify

- [ ] 5.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
- [ ] 5.2 Run the `scraper-core` test suite
- [ ] 5.3 Run a local scrape and confirm exactly one Chromium process is spawned for a run touching both Chronogolf and TeeOn
- [ ] 5.4 Confirm SIGINT tears the browser down cleanly, leaving no orphaned Chromium process
