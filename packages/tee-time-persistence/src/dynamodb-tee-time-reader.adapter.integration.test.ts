import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { DynamoDbTeeTimeReader } from './dynamodb-tee-time-reader.adapter.js';
import {
  TEE_TIME_TABLE_PARTITION_KEY,
  TEE_TIME_TABLE_SORT_KEY,
  TEE_TIME_TABLE_TTL_ATTRIBUTE,
} from './dynamodb-tee-time-table.js';

const TABLE_NAME = 'tee-times-test';
// Port amazon/dynamodb-local listens on inside the container; testcontainers maps
// it to a random host port, so this is the container-internal port to wait on.
const DYNAMODB_LOCAL_PORT = 8000;
const DATE = '2026-07-15';

function teeTime(overrides: Partial<TeeTime> = {}): TeeTime {
  return {
    startInstant: '2026-07-15T06:00:00-06:00',
    courseId: 'greenbryre',
    courseName: 'Greenbryre',
    holes: 18,
    routing: [],
    groupSizes: [2, 3, 4],
    bookingUrls: { 2: 'https://example.com' },
    onlineBookable: true,
    scrapedAt: '2026-07-14T18:00:00Z',
    pricePerPlayer: 42.5,
    ...overrides,
  };
}

describe('DynamoDbTeeTimeReader (local DynamoDB)', () => {
  let container: StartedTestContainer;
  let client: DynamoDBDocumentClient;
  let reader: DynamoDbTeeTimeReader;
  let sortKeyCounter: number;

  beforeAll(async () => {
    container = await new GenericContainer('amazon/dynamodb-local')
      .withExposedPorts(DYNAMODB_LOCAL_PORT)
      .start();

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(DYNAMODB_LOCAL_PORT)}`;
    client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        endpoint,
        region: 'local',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    );
    reader = new DynamoDbTeeTimeReader(client, TABLE_NAME);
  });

  afterAll(async () => {
    client?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
    sortKeyCounter = 0;
    await client
      .send(new DeleteTableCommand({ TableName: TABLE_NAME }))
      .catch(() => undefined);
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
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
  });

  // Persists a tee time carrying the storage-only PK/SK/ttl attributes the reader
  // is expected to drop; `padding` inflates item size to force query paging.
  async function seed(date: string, value: TeeTime, padding = ''): Promise<void> {
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...value,
          [TEE_TIME_TABLE_PARTITION_KEY]: date,
          [TEE_TIME_TABLE_SORT_KEY]: `sk#${sortKeyCounter++}`,
          [TEE_TIME_TABLE_TTL_ATTRIBUTE]: Math.floor(
            new Date(value.startInstant).getTime() / 1000
          ),
          padding,
        },
      })
    );
  }

  it('returns every course in the date partition as clean TeeTime records', async () => {
    const greenbryre = teeTime({ courseId: 'greenbryre', courseName: 'Greenbryre' });
    const holiday = teeTime({ courseId: 'holiday-park', courseName: 'Holiday Park' });
    await seed(DATE, greenbryre);
    await seed(DATE, holiday);
    await seed('2026-07-16', teeTime());

    const result = await reader.readTeeTimesForDate(DATE);

    expect(result).toHaveLength(2);
    expect([...result].map((t) => t.courseId).sort()).toEqual([
      'greenbryre',
      'holiday-park',
    ]);
    expect(result).toContainEqual(greenbryre);
    for (const value of result) {
      expect(value).not.toHaveProperty(TEE_TIME_TABLE_PARTITION_KEY);
      expect(value).not.toHaveProperty(TEE_TIME_TABLE_SORT_KEY);
      expect(value).not.toHaveProperty(TEE_TIME_TABLE_TTL_ATTRIBUTE);
      expect(value).not.toHaveProperty('padding');
    }
  });

  it('returns an empty set for a date with no tee times', async () => {
    await seed('2026-07-16', teeTime());

    const result = await reader.readTeeTimesForDate(DATE);

    expect(result).toEqual([]);
  });

  it('pages through a partition larger than a single query response', async () => {
    // Each padded item is ~200 KB, so a dozen exceed DynamoDB's ~1 MB page and
    // force the reader to page on LastEvaluatedKey.
    const padding = 'x'.repeat(200 * 1024);
    const count = 12;
    for (let index = 0; index < count; index++) {
      await seed(DATE, teeTime(), padding);
    }

    const result = await reader.readTeeTimesForDate(DATE);

    expect(result).toHaveLength(count);
  });

  it('returns an empty set when the table does not exist', async () => {
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));

    const result = await reader.readTeeTimesForDate(DATE);

    expect(result).toEqual([]);
  });
});
