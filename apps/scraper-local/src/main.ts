import { IngestionPipeline } from '@stt/scraper-core/domain/ingestion-pipeline';
import { PricingEngine } from '@stt/scraper-core/domain/pricing-engine';
import { TeeTimeOrchestrator } from '@stt/scraper-core/domain/tee-time-orchestrator';
import { DynamoDbTeeTimeRepository } from '@stt/scraper-core/persistence/dynamodb-tee-time-repository';
import { ChronogolfV1Scraper } from '@stt/scraper-core/platforms/chronogolf-v1';
import {
  greenbryreConfig,
  greenbryrePricingConfig,
} from '@stt/scraper-core/platforms/chronogolf-v1/courses/greenbryre';
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
import { PlaywrightJsonFetcher } from '@stt/scraper-core/transport/playwright-json-fetcher';
import { HostLimitedJsonFetcher } from '@stt/scraper-core/transport/host-limited-json-fetcher';
import { HttpTextFetcher } from '@stt/scraper-core/transport/http-text-fetcher';
import { HostLimitedTextFetcher } from '@stt/scraper-core/transport/host-limited-text-fetcher';
import { BottleneckRequestLimiter } from '@stt/scraper-core/transport/bottleneck-request-limiter';
import cron from 'node-cron';
import { loadConfig, type ScraperLocalConfig } from './config.js';
import { ConsoleLogger } from './console-logger.adapter.js';
import { createDynamoDbClient, ensureTeeTimeTable } from './dynamodb-setup.js';
import { type Logger } from '@stt/scraper-core/domain/logger';
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

  const { client, documentClient } = createDynamoDbClient(config.DYNAMODB_ENDPOINT);
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

  const fetcher = new PlaywrightJsonFetcher();
  const limitedFetcher = new HostLimitedJsonFetcher(
    fetcher,
    new BottleneckRequestLimiter(limiterConfig)
  );
  const chronogolfScraper = new ChronogolfV1Scraper([greenbryreConfig], limitedFetcher);

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
    [chronogolfScraper, webtracScraper],
    logger
  );
  const repository = new DynamoDbTeeTimeRepository(
    documentClient,
    config.DYNAMODB_TABLE_NAME
  );
  const pricingEngine = new PricingEngine(
    new Map([
      [greenbryreConfig.courseId, greenbryrePricingConfig],
      [holidayParkChampionshipConfig.courseId, holidayParkChampionshipPricingConfig],
      [holidayParkExecutive9Config.courseId, holidayParkExecutive9PricingConfig],
      [silverwoodConfig.courseId, silverwoodPricingConfig],
      [wildwoodConfig.courseId, wildwoodPricingConfig],
    ])
  );
  const pipeline = new IngestionPipeline(
    orchestrator,
    repository,
    logger,
    pricingEngine
  );

  setupAndStartIngestionPipelineCronSchedule(config, pipeline, logger, fetcher, client);
}

function setupAndStartIngestionPipelineCronSchedule(
  config: ScraperLocalConfig,
  pipeline: IngestionPipeline,
  logger: Logger,
  fetcher: PlaywrightJsonFetcher,
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
    await fetcher.close();
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
