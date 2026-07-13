import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, type TranslateConfig } from '@aws-sdk/lib-dynamodb';

/**
 * How a DynamoDB client should be constructed for a given runtime.
 *
 * The two modes genuinely diverge: `local` MUST override the endpoint and supply
 * dummy credentials so it only ever talks to a local DynamoDB, while `aws` is
 * near-zero-config so a Lambda execution role and the auto-injected `AWS_REGION`
 * resolve naturally.
 */
export type DynamoDbClientConfig =
  { mode: 'local'; endpoint: string } | { mode: 'aws'; region?: string };

// Marshalling config shared across every environment so items serialize
// identically in local and prod. Centralized here so no composition root can
// drift from it.
const TRANSLATE_CONFIG: TranslateConfig = {
  marshallOptions: {
    removeUndefinedValues: true,
  },
};

/**
 * Build a base and document DynamoDB client for the given runtime mode.
 *
 * The document client is returned alongside its base client so callers can both
 * marshal items and issue control-plane commands (table creation, `destroy`)
 * over the same connection. All environments share {@link TRANSLATE_CONFIG} so
 * item serialization is identical locally and in production.
 *
 * @param config - Discriminated runtime config selecting the local or AWS mode.
 * @returns The base and document DynamoDB clients.
 *
 * @example
 * ```typescript
 * const { documentClient } = createDynamoDbClient({ mode: 'local', endpoint: 'http://localhost:8000' });
 * ```
 */
export function createDynamoDbClient(config: DynamoDbClientConfig): {
  client: DynamoDBClient;
  documentClient: DynamoDBDocumentClient;
} {
  const client =
    config.mode === 'local'
      ? new DynamoDBClient({
          endpoint: config.endpoint,
          region: 'local',
          // Local DynamoDB ignores credentials but the SDK still requires them to sign
          // requests, so explicit dummy values are supplied.
          credentials: {
            accessKeyId: 'local',
            secretAccessKey: 'local',
          },
        })
      : new DynamoDBClient(config.region ? { region: config.region } : {});

  return {
    client,
    documentClient: DynamoDBDocumentClient.from(client, TRANSLATE_CONFIG),
  };
}
