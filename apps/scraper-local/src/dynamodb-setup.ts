import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  TEE_TIME_TABLE_PARTITION_KEY,
  TEE_TIME_TABLE_SORT_KEY,
  TEE_TIME_TABLE_TTL_ATTRIBUTE,
} from '@stt/scraper-core/persistence/tee-time-table';

// Local DynamoDB ignores credentials but the SDK still requires them to sign
// requests, so explicit dummy values are supplied
const LOCAL_DUMMY_CREDENTIALS = {
  accessKeyId: 'local',
  secretAccessKey: 'local',
};
const LOCAL_DUMMY_REGION = 'local';

// Bound on how long to wait for a freshly created table to become ACTIVE.
const TABLE_ACTIVE_WAIT_SECONDS = 30;

/**
 * Build a DynamoDB document client pointed at the configured local endpoint.
 *
 * The endpoint and credentials are set explicitly so the client only ever talks to
 * local DynamoDB. The document client is returned alongside its base client so callers
 * can both marshal items and issue control-plane commands (table creation) over the
 * same connection.
 *
 * @param endpoint - Endpoint of the local DynamoDB service.
 * @returns The base and document DynamoDB clients.
 *
 * @example
 * ```typescript
 * const { documentClient } = createDynamoDbClient('http://localhost:8000', 'local');
 * ```
 */
export function createDynamoDbClient(endpoint: string): {
  client: DynamoDBClient;
  documentClient: DynamoDBDocumentClient;
} {
  const client = new DynamoDBClient({
    endpoint,
    region: LOCAL_DUMMY_REGION,
    credentials: LOCAL_DUMMY_CREDENTIALS,
  });
  return { client, documentClient: DynamoDBDocumentClient.from(client) };
}

/**
 * Ensure the tee-times table exists with TTL enabled on the local endpoint.
 *
 * Idempotent: production provisions the table via OpenTofu, so this only exists
 * to bootstrap the local store. Creating an already-present table is treated as
 * success, and enabling an already-enabled TTL is a no-op, so repeated startups
 * are safe.
 *
 * @param client - A DynamoDB client bound to the local endpoint.
 * @param tableName - The table to create if it does not already exist.
 * @returns Resolves once the table is ACTIVE with TTL enabled.
 */
export async function ensureTeeTimeTable(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  const created = await createTableIfAbsent(client, tableName);
  if (created) {
    await waitUntilTableExists(
      { client, maxWaitTime: TABLE_ACTIVE_WAIT_SECONDS },
      { TableName: tableName }
    );
  }
  await enableTimeToLive(client, tableName);
}

async function createTableIfAbsent(
  client: DynamoDBClient,
  tableName: string
): Promise<boolean> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: TEE_TIME_TABLE_PARTITION_KEY, AttributeType: 'S' },
          { AttributeName: TEE_TIME_TABLE_SORT_KEY, AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: TEE_TIME_TABLE_PARTITION_KEY, KeyType: 'HASH' },
          { AttributeName: TEE_TIME_TABLE_SORT_KEY, KeyType: 'RANGE' },
        ],
      })
    );
    return true;
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      return false;
    }
    throw error;
  }
}

async function enableTimeToLive(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  const { TimeToLiveDescription } = await client.send(
    new DescribeTimeToLiveCommand({ TableName: tableName })
  );
  const status = TimeToLiveDescription?.TimeToLiveStatus;
  if (status === 'ENABLED' || status === 'ENABLING') {
    return;
  }
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: TEE_TIME_TABLE_TTL_ATTRIBUTE,
      },
    })
  );
}
