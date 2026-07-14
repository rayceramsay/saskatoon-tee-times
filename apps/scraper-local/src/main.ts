import { IngestionPipeline } from '@stt/scraper-core/domain/ingestion-pipeline';
import { PricingEngine } from '@stt/scraper-core/domain/pricing-engine';
import { TeeTimeOrchestrator } from '@stt/scraper-core/domain/tee-time-orchestrator';
import { DynamoDbTeeTimeWriter } from '@stt/tee-time-persistence/dynamodb-tee-time-writer';
import { ChronogolfV1Scraper } from '@stt/scraper-core/platforms/chronogolf-v1';
import {
  greenbryreConfig,
  greenbryrePricingConfig,
} from '@stt/scraper-core/platforms/chronogolf-v1/courses/greenbryre';
import { ChronogolfV2Scraper } from '@stt/scraper-core/platforms/chronogolf-v2';
import {
  theWillowsConfig,
  theWillowsPricingConfig,
} from '@stt/scraper-core/platforms/chronogolf-v2/courses/the-willows';
import { WebtracScraper } from '@stt/scraper-core/platforms/webtrac';
import {
  holidayParkChampionshipConfig,
  holidayParkChampionshipPricingConfig,
} from '@stt/scraper-core/platforms/webtrac/courses/holiday-park-championship';
import {
  holidayParkExecutive9Config,
  holidayParkExecutive9PricingConfig,
} from '@stt/scraper-core/platforms/webtrac/courses/holiday-park-executive-9';
import {
  silverwoodConfig,
  silverwoodPricingConfig,
} from '@stt/scraper-core/platforms/webtrac/courses/silverwood';
import {
  wildwoodConfig,
  wildwoodPricingConfig,
} from '@stt/scraper-core/platforms/webtrac/courses/wildwood';
import { TeeOnScraper } from '@stt/scraper-core/platforms/teeon';
import {
  theLegendsConfig,
  theLegendsPricingConfig,
} from '@stt/scraper-core/platforms/teeon/courses/the-legends';
import { PlaywrightJsonFetcher } from '@stt/scraper-core/transport/playwright-json-fetcher';
import { HostLimitedJsonFetcher } from '@stt/scraper-core/transport/host-limited-json-fetcher';
import { PlaywrightCapturedJsonFetcher } from '@stt/scraper-core/transport/playwright-captured-json-fetcher';
import { HostLimitedCapturedJsonFetcher } from '@stt/scraper-core/transport/host-limited-captured-json-fetcher';
import { HttpTextFetcher } from '@stt/scraper-core/transport/http-text-fetcher';
import { HostLimitedTextFetcher } from '@stt/scraper-core/transport/host-limited-text-fetcher';
import { BottleneckRequestLimiter } from '@stt/scraper-core/transport/bottleneck-request-limiter';
import cron from 'node-cron';
import { createDynamoDbClient } from '@stt/tee-time-persistence/dynamodb-client-factory';
import { loadConfig, type ScraperLocalConfig } from './config.js';
import { ConsoleLogger } from './console-logger.adapter.js';
import { ensureTeeTimeTable } from './dynamodb-setup.js';
import { type Logger } from '@stt/tee-time-domain/logger';
import { type DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Composition root for the local scraper runtime.
 *
 * Wires the platform scrapers and their course configs through the orchestrator and
 * ingestion pipeline into a local DynamoDB, then drives it on an in-process schedule.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const logger = new ConsoleLogger(config.LOG_LEVEL);

  const { client, documentClient } = createDynamoDbClient({
    mode: 'local',
    endpoint: config.DYNAMODB_ENDPOINT,
  });
  await ensureTeeTimeTable(client, config.DYNAMODB_TABLE_NAME);

  const limiterConfig = {
    perHost: {
      default: { maxConcurrent: config.SCRAPER_PER_HOST_MAX_CONCURRENT },
      overrides: {},
    },
    globalMaxConcurrent: config.SCRAPER_GLOBAL_MAX_CONCURRENT,
    retry: {
      maxAttempts: config.SCRAPER_MAX_RETRY_ATTEMPTS,
      maxRetryAfterSeconds: config.SCRAPER_MAX_RETRY_AFTER_SECONDS,
    },
  };

  // One limiter instance for the whole browser stack: its global ceiling models
  // the number of Playwright pages open at once, a budget shared across every
  // browser-driven scraper. Per-host caps stay independent by hostname within it.
  const browserLimiter = new BottleneckRequestLimiter(limiterConfig);

  const fetcher = new PlaywrightJsonFetcher();
  const limitedFetcher = new HostLimitedJsonFetcher(fetcher, browserLimiter);
  const chronogolfScraper = new ChronogolfV1Scraper([greenbryreConfig], limitedFetcher);
  const chronogolfV2Scraper = new ChronogolfV2Scraper(
    [theWillowsConfig],
    limitedFetcher
  );

  const capturedFetcher = new PlaywrightCapturedJsonFetcher();
  const limitedCapturedFetcher = new HostLimitedCapturedJsonFetcher(
    capturedFetcher,
    browserLimiter
  );
  const teeOnScraper = new TeeOnScraper([theLegendsConfig], limitedCapturedFetcher);

  // WebTrac serves plain HTML over fetch and gets its own limiter instance: its
  // global ceiling models plain-fetch fan-out, distinct from the browser stack.
  const limitedTextFetcher = new HostLimitedTextFetcher(
    new HttpTextFetcher(),
    new BottleneckRequestLimiter(limiterConfig)
  );
  const webtracScraper = new WebtracScraper(
    [
      holidayParkChampionshipConfig,
      holidayParkExecutive9Config,
      silverwoodConfig,
      wildwoodConfig,
    ],
    limitedTextFetcher
  );

  const orchestrator = new TeeTimeOrchestrator(
    [chronogolfScraper, chronogolfV2Scraper, webtracScraper, teeOnScraper],
    logger
  );
  const writer = new DynamoDbTeeTimeWriter(documentClient, config.DYNAMODB_TABLE_NAME);
  const pricingEngine = new PricingEngine(
    new Map([
      [greenbryreConfig.courseId, greenbryrePricingConfig],
      [theWillowsConfig.courseId, theWillowsPricingConfig],
      [holidayParkChampionshipConfig.courseId, holidayParkChampionshipPricingConfig],
      [holidayParkExecutive9Config.courseId, holidayParkExecutive9PricingConfig],
      [silverwoodConfig.courseId, silverwoodPricingConfig],
      [wildwoodConfig.courseId, wildwoodPricingConfig],
      [theLegendsConfig.courseId, theLegendsPricingConfig],
    ])
  );
  const pipeline = new IngestionPipeline(orchestrator, writer, logger, pricingEngine);

  setupAndStartIngestionPipelineCronSchedule(
    config,
    pipeline,
    logger,
    fetcher,
    capturedFetcher,
    client
  );
}

function setupAndStartIngestionPipelineCronSchedule(
  config: ScraperLocalConfig,
  pipeline: IngestionPipeline,
  logger: Logger,
  fetcher: PlaywrightJsonFetcher,
  capturedFetcher: PlaywrightCapturedJsonFetcher,
  client: DynamoDBClient
) {
  const task = cron.schedule(config.SCRAPE_CRON, () => pipeline.run(new Date()), {
    name: 'scrape-tee-times',
    noOverlap: true, // skip a tick if the previous run is still in flight
  });
  task.on('execution:failed', (context) => {
    logger.error('Scheduled run failed', { error: context.execution?.error });
  });
  task.on('execution:overlap', () => {
    logger.warn('Skipping scheduled run; previous run still in progress');
  });

  const shutdown = async (): Promise<void> => {
    await task.destroy();
    await Promise.all([fetcher.close(), capturedFetcher.close()]);
    client.destroy();
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  logger.info(
    `scraper-local started: writing to "${config.DYNAMODB_TABLE_NAME}" at ${config.DYNAMODB_ENDPOINT} on cron "${config.SCRAPE_CRON}"`
  );
  // cron.schedule auto-starts; execute() covers the immediate first run. Failures surface
  // through the execution:failed handler above, so the promise is only guarded here.
  void task.execute().catch(() => {});
}

await main();
