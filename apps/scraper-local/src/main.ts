import { IngestionPipeline } from '@stt/scraper-core/domain/ingestion-pipeline';
import { TeeTimeOrchestrator } from '@stt/scraper-core/domain/tee-time-orchestrator';
import { DynamoDbTeeTimeRepository } from '@stt/scraper-core/persistence/dynamodb-tee-time-repository';
import { ChronogolfV1Scraper } from '@stt/scraper-core/platforms/chronogolf-v1';
import { greenbryreConfig } from '@stt/scraper-core/platforms/chronogolf-v1/courses/greenbryre';
import { PlaywrightJsonFetcher } from '@stt/scraper-core/transport/playwright-json-fetcher';
import { HostLimitedJsonFetcher } from '@stt/scraper-core/transport/host-limited-json-fetcher';
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

  const fetcher = new PlaywrightJsonFetcher();
  const limiter = new BottleneckRequestLimiter({
    perHost: {
      default: { maxConcurrent: config.SCRAPER_PER_HOST_MAX_CONCURRENT },
      overrides: {},
    },
    browserPageCeiling: config.SCRAPER_MAX_BROWSER_PAGES,
    retry: {
      maxAttempts: config.SCRAPER_MAX_RETRY_ATTEMPTS,
      maxRetryAfterSeconds: config.SCRAPER_MAX_RETRY_AFTER_SECONDS,
    },
  });
  const limitedFetcher = new HostLimitedJsonFetcher(fetcher, limiter);
  const scraper = new ChronogolfV1Scraper([greenbryreConfig], limitedFetcher);
  const orchestrator = new TeeTimeOrchestrator([scraper], logger);
  const repository = new DynamoDbTeeTimeRepository(
    documentClient,
    config.DYNAMODB_TABLE_NAME
  );
  const pipeline = new IngestionPipeline(orchestrator, repository, logger);

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
