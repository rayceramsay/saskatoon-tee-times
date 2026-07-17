## Why

`PlaywrightJsonFetcher` and `PlaywrightCapturedJsonFetcher` each lazily launch their own Chromium process and browser context, so a scrape that touches both Chronogolf and TeeOn runs two browsers where one would do — paying twice the baseline process memory and twice the launch cost on every cold start. The deeper problem is that each adapter constructs and owns the infrastructure it depends on, which contradicts the project's dependency-injection principle and leaves `close()` off both fetcher ports; the composition root has to hold the concrete adapter types purely to shut them down. This blocks `apps/scraper-lambda` (currently an empty package): Lambda freezes its container between invocations, so a lazily-launched browser nobody closes leaks into a frozen container with dead sockets, and the browser's lifetime must be per-invocation there versus per-process locally.

## What Changes

- Introduce a `PlaywrightBrowserSession` in `scraper-core/src/transport` that owns the Chromium launch, a single shared `BrowserContext`, and teardown, exposing page acquisition to its consumers and one `close()`.
- Centralize Chromium launch arguments in the session, giving Lambda-required flags (`--no-sandbox`, `--disable-dev-shm-usage`) a single home instead of duplicating them across composition roots.
- **BREAKING** `PlaywrightJsonFetcher` and `PlaywrightCapturedJsonFetcher` take a `PlaywrightBrowserSession` via constructor injection; they no longer launch browsers, hold `browserPromise`/`contextPromise`, or expose `close()`.
- Update `apps/scraper-local/src/main.ts` to launch one session at startup, inject it into both fetchers, and close it once on shutdown — dropping the concrete adapter types from the cron-setup signature.
- Rework both adapters' tests to inject a fake session rather than `vi.mock('playwright-core')`, testing behavior instead of module wiring.

## Capabilities

### New Capabilities

_None. The change introduces no new capability; it restructures ownership of an existing transport's infrastructure._

### Modified Capabilities

- `scraper-request-limiting`: adds a requirement that browser-backed transports receive an injected, externally-owned browser session and share one browser process and context, rather than each adapter launching and owning its own.

## Impact

- **Code**: `packages/scraper-core/src/transport/` — new `playwright-browser-session.ts`; `playwright-json-fetcher.adapter.ts` and `playwright-captured-json-fetcher.adapter.ts` lose their lifecycle blocks; both `.test.ts` files rework their stubs. `apps/scraper-local/src/main.ts` composition root and shutdown path.
- **Package exports**: new `./transport/playwright-browser-session` entry in `packages/scraper-core/package.json`.
- **Downstream**: unblocks `apps/scraper-lambda`, whose handler will own a per-invocation session closed in a `finally`.
- **Dependencies**: none added; `playwright-core` stays where it is.
- **Behavior**: a single shared context means one cookie jar across hosts. Cookies are origin-scoped so Chronogolf's Cloudflare clearance and TeeOn's session do not collide, and the adapters already reuse one context across calls today, so this is not a regression. The session keeps a browser/context seam so per-platform context isolation stays cheap to reintroduce if TeeOn ever needs a fresh session per navigation.
- **Not affected**: the `JsonFetcher`, `CapturedJsonFetcher`, and `TextFetcher` port contracts; the host-limited decorators; `BottleneckRequestLimiter` and its concurrency ceilings; every scraper adapter.
