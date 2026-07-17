import { IngestionPipeline } from '@stt/scraper-core/domain/ingestion-pipeline';
import { PlaywrightBrowserSession } from '@stt/scraper-core/transport/playwright-browser-session';
import { DynamoDbTeeTimeWriter } from '@stt/tee-time-persistence/dynamodb-tee-time-writer';
import cron from 'node-cron';
import { createDynamoDbClient } from '@stt/tee-time-persistence/dynamodb-client-factory';
import { loadConfig, type ScraperLocalConfig } from './config.js';
import { ConsoleLogger } from './console-logger.adapter.js';
import { createIngestionPipeline } from './ingestion-pipeline.factory.js';
import { ensureTeeTimeTable } from './dynamodb-setup.js';
import { type Logger } from '@stt/tee-time-domain/logger';
import { type DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Composition root for the local scraper runtime.
 *
 * Owns the resources the shared pipeline factory will not: the DynamoDB client
 * and the browser session, both released on shutdown. Drives the pipeline on an
 * in-process schedule.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const logger = new ConsoleLogger(config.LOG_LEVEL);

  const { client, documentClient } = createDynamoDbClient({
    mode: 'local',
    endpoint: config.DYNAMODB_ENDPOINT,
  });
  await ensureTeeTimeTable(client, config.DYNAMODB_TABLE_NAME);

  // One browser for every browser-driven scraper, bounded by this process.
  const browserSession = await PlaywrightBrowserSession.launch();

  const writer = new DynamoDbTeeTimeWriter(documentClient, config.DYNAMODB_TABLE_NAME);

  const pipeline = createIngestionPipeline({
    writer,
    browserSession,
    logger,
    limiterConfig: {
      perHost: {
        default: { maxConcurrent: config.SCRAPER_PER_HOST_MAX_CONCURRENT },
        overrides: {},
      },
      globalMaxConcurrent: config.SCRAPER_GLOBAL_MAX_CONCURRENT,
      retry: {
        maxAttempts: config.SCRAPER_MAX_RETRY_ATTEMPTS,
        maxRetryAfterSeconds: config.SCRAPER_MAX_RETRY_AFTER_SECONDS,
      },
    },
  });

  setupAndStartIngestionPipelineCronSchedule(
    config,
    pipeline,
    logger,
    browserSession,
    client
  );
}

function setupAndStartIngestionPipelineCronSchedule(
  config: ScraperLocalConfig,
  pipeline: IngestionPipeline,
  logger: Logger,
  browserSession: PlaywrightBrowserSession,
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
    await browserSession.close();
    client.destroy();
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  logger.info(
    `scraper started: writing to "${config.DYNAMODB_TABLE_NAME}" at ${config.DYNAMODB_ENDPOINT} on cron "${config.SCRAPE_CRON}"`
  );
  // cron.schedule auto-starts; execute() covers the immediate first run. Failures surface
  // through the execution:failed handler above, so the promise is only guarded here.
  void task.execute().catch(() => {});
}

await main();
