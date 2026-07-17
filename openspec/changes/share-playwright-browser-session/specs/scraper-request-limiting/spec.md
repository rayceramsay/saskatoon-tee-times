## ADDED Requirements

### Requirement: Shared browser session owned outside the transports

The system SHALL provide a `PlaywrightBrowserSession` that owns the Chromium browser process and a single browser context, and exposes page acquisition to browser-backed transports plus one teardown operation releasing both. Browser-backed transports (`PlaywrightJsonFetcher` and `PlaywrightCapturedJsonFetcher`) SHALL receive a session through constructor injection and SHALL NOT launch a browser, hold browser or context state, or expose their own teardown. A composition root wiring several browser-backed transports SHALL construct one session, inject it into all of them, and close it once, so a scrape runs a single Chromium process regardless of how many browser-backed transports participate. Chromium launch arguments SHALL be configured in one place within the session rather than duplicated per composition root. The session's lifetime SHALL be determined by its composition root — bounded by the process for a long-running runtime, and by the invocation for a serverless handler — so a browser is never held across a frozen container.

#### Scenario: Two browser-backed transports share one browser process

- **WHEN** a composition root injects a single session into both the browser JSON fetcher and the captured-JSON fetcher, and a scrape drives both
- **THEN** exactly one Chromium browser and one context are launched for the whole scrape
- **AND** each fetch acquires its page from that shared session

#### Scenario: Transports do not own browser lifecycle

- **WHEN** a browser-backed transport is constructed
- **THEN** it launches no browser and exposes no teardown operation
- **AND** it acquires pages only through the injected session

#### Scenario: Closing the session releases the browser once

- **WHEN** a composition root closes the session it created, after both transports have run
- **THEN** the shared context and browser are released
- **AND** no further teardown is required of either transport

#### Scenario: Session is substitutable in tests without module mocking

- **WHEN** a browser-backed transport is constructed with a test double implementing the session's page-acquisition surface
- **THEN** its fetch behavior is exercised through that double with no mocking of the Playwright module

#### Scenario: A page is released after each fetch

- **WHEN** a fetch through a browser-backed transport completes, whether it succeeds or throws
- **THEN** the page it acquired is closed
- **AND** the session's browser and context stay open for subsequent fetches
