import { IngestionPipeline } from '@stt/scraper-core/domain/ingestion-pipeline';
import { PricingEngine } from '@stt/scraper-core/domain/pricing-engine';
import { TeeTimeOrchestrator } from '@stt/scraper-core/domain/tee-time-orchestrator';
import { ChronogolfV1Scraper } from '@stt/scraper-core/platforms/chronogolf-v1';
import { greenbryreConfig } from '@stt/scraper-core/platforms/chronogolf-v1/courses/greenbryre';
import { dakotaDunesConfig } from '@stt/scraper-core/platforms/chronogolf-v1/courses/dakota-dunes';
import { ChronogolfV2Scraper } from '@stt/scraper-core/platforms/chronogolf-v2';
import { theWillowsConfig } from '@stt/scraper-core/platforms/chronogolf-v2/courses/the-willows';
import { WebtracScraper } from '@stt/scraper-core/platforms/webtrac';
import { holidayParkChampionshipConfig } from '@stt/scraper-core/platforms/webtrac/courses/holiday-park-championship';
import { holidayParkExecutive9Config } from '@stt/scraper-core/platforms/webtrac/courses/holiday-park-executive-9';
import { silverwoodConfig } from '@stt/scraper-core/platforms/webtrac/courses/silverwood';
import { wildwoodConfig } from '@stt/scraper-core/platforms/webtrac/courses/wildwood';
import { TeeOnScraper } from '@stt/scraper-core/platforms/teeon';
import { theLegendsConfig } from '@stt/scraper-core/platforms/teeon/courses/the-legends';
import { BottleneckRequestLimiter } from '@stt/scraper-core/transport/bottleneck-request-limiter';
import { HostLimitedCapturedJsonFetcher } from '@stt/scraper-core/transport/host-limited-captured-json-fetcher';
import { HostLimitedJsonFetcher } from '@stt/scraper-core/transport/host-limited-json-fetcher';
import { HostLimitedTextFetcher } from '@stt/scraper-core/transport/host-limited-text-fetcher';
import { HttpTextFetcher } from '@stt/scraper-core/transport/http-text-fetcher';
import { PlaywrightCapturedJsonFetcher } from '@stt/scraper-core/transport/playwright-captured-json-fetcher';
import { PlaywrightJsonFetcher } from '@stt/scraper-core/transport/playwright-json-fetcher';
import type { PlaywrightBrowserSession } from '@stt/scraper-core/transport/playwright-browser-session';
import type { RequestLimiterConfig } from '@stt/scraper-core/transport/request-limiter-config';
import type { Logger } from '@stt/tee-time-domain/logger';
import type { TeeTimeWriter } from '@stt/tee-time-domain/tee-time-writer';

const chronogolfV1Configs = [greenbryreConfig, dakotaDunesConfig];
const chronogolfV2Configs = [theWillowsConfig];
const webtracConfigs = [
  holidayParkChampionshipConfig,
  holidayParkExecutive9Config,
  silverwoodConfig,
  wildwoodConfig,
];
const teeOnConfigs = [theLegendsConfig];

const allConfigs = [
  ...chronogolfV1Configs,
  ...chronogolfV2Configs,
  ...webtracConfigs,
  ...teeOnConfigs,
];

/** Collaborators the ingestion pipeline depends on, supplied by the composition root. */
export interface IngestionPipelineDeps {
  writer: TeeTimeWriter;
  browserSession: PlaywrightBrowserSession;
  logger: Logger;
  limiterConfig: RequestLimiterConfig;
}

/**
 * Build the tee time ingestion pipeline shared by every scraper runtime.
 *
 * Owns only the wiring that is identical across runtimes; it allocates nothing
 * that must be closed, so the caller retains every resource lifetime.
 *
 * @param deps - The pipeline's injected collaborators.
 * @returns The configured ingestion pipeline, ready to run.
 *
 * @example
 * ```typescript
 * const pipeline = createIngestionPipeline({ writer, browserSession, logger, limiterConfig });
 * ```
 */
export function createIngestionPipeline({
  writer,
  browserSession,
  logger,
  limiterConfig,
}: IngestionPipelineDeps): IngestionPipeline {
  // One limiter instance for the whole browser stack: its global ceiling models
  // the number of Playwright pages open at once, a budget shared across every
  // browser-driven scraper. Per-host caps stay independent by hostname within it.
  const browserLimiter = new BottleneckRequestLimiter(limiterConfig);

  const limitedFetcher = new HostLimitedJsonFetcher(
    new PlaywrightJsonFetcher(browserSession),
    browserLimiter
  );
  const chronogolfScraper = new ChronogolfV1Scraper(
    chronogolfV1Configs,
    limitedFetcher
  );
  const chronogolfV2Scraper = new ChronogolfV2Scraper(
    chronogolfV2Configs,
    limitedFetcher
  );

  const limitedCapturedFetcher = new HostLimitedCapturedJsonFetcher(
    new PlaywrightCapturedJsonFetcher(browserSession),
    browserLimiter
  );
  const teeOnScraper = new TeeOnScraper(teeOnConfigs, limitedCapturedFetcher);

  // WebTrac serves plain HTML over fetch and gets its own limiter instance: its
  // global ceiling models plain-fetch fan-out, distinct from the browser stack.
  const limitedTextFetcher = new HostLimitedTextFetcher(
    new HttpTextFetcher(),
    new BottleneckRequestLimiter(limiterConfig)
  );
  const webtracScraper = new WebtracScraper(webtracConfigs, limitedTextFetcher);

  const orchestrator = new TeeTimeOrchestrator(
    [chronogolfScraper, chronogolfV2Scraper, webtracScraper, teeOnScraper],
    logger
  );
  const pricingEngine = new PricingEngine(
    new Map(allConfigs.map((course) => [course.courseId, course.pricing]))
  );

  return new IngestionPipeline(orchestrator, writer, logger, pricingEngine);
}
