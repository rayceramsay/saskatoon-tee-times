import { serve } from '@hono/node-server';
import { createDynamoDbClient } from '@stt/tee-time-persistence/dynamodb-client-factory';
import { DynamoDbTeeTimeReader } from '@stt/tee-time-persistence/dynamodb-tee-time-reader';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Composition root for the local API runtime.
 *
 * Wires the local DynamoDB reader into the Hono app and serves it over HTTP,
 * reading from the same local table the scraper writes to.
 */
function main(): void {
  const config = loadConfig();

  const { client, documentClient } = createDynamoDbClient({
    mode: 'local',
    endpoint: config.DYNAMODB_ENDPOINT,
  });
  const reader = new DynamoDbTeeTimeReader(documentClient, config.DYNAMODB_TABLE_NAME);

  const app = createApp({
    reader,
    corsOrigin: config.CORS_ORIGIN,
    exposeErrorDetails: config.EXPOSE_ERROR_DETAILS,
  });

  const server = serve({ fetch: app.fetch, port: config.PORT });

  const shutdown = (): void => {
    server.close();
    client.destroy();
  };
  process.once('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  console.log(
    `api started: reading from DynamoDB table "${config.DYNAMODB_TABLE_NAME}" at ${config.DYNAMODB_ENDPOINT} on port ${config.PORT}`
  );
}

main();
