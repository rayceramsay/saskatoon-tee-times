import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { TeeTime } from '../domain/tee-time.schema.js';
import type { ScrapeUnitKey } from './tee-time-repository.port.js';
import { DynamoDbTeeTimeRepository } from './dynamodb-tee-time-repository.adapter.js';
import {
  TEE_TIME_TABLE_PARTITION_KEY,
  TEE_TIME_TABLE_SORT_KEY,
  TEE_TIME_TABLE_TTL_ATTRIBUTE,
} from './dynamodb-tee-time-table.js';

const TABLE_NAME = 'tee-times-test';
const DYNAMODB_LOCAL_PORT = 8093;

const unit: ScrapeUnitKey = { courseId: 'greenbryre', date: '2026-07-10' };

function teeTime(overrides: Partial<TeeTime> = {}): TeeTime {
  return {
    startInstant: '2026-07-10T06:00:00-06:00',
    courseId: 'greenbryre',
    courseName: 'Greenbryre',
    holes: 12,
    routing: [],
    groupSizes: [2, 3, 4],
    bookingUrls: { 2: 'https://example.com' },
    scrapedAt: '2026-07-07T18:00:00Z',
    pricePerPlayer: 42.5,
    ...overrides,
  };
}

describe('DynamoDbTeeTimeRepository (local DynamoDB)', () => {
  let container: StartedTestContainer;
  let client: DynamoDBDocumentClient;
  let repository: DynamoDbTeeTimeRepository;

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
    repository = new DynamoDbTeeTimeRepository(client, TABLE_NAME);
  });

  afterAll(async () => {
    client?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
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

  async function storedItems(): Promise<Record<string, unknown>[]> {
    const response = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': TEE_TIME_TABLE_PARTITION_KEY },
        ExpressionAttributeValues: { ':pk': unit.date },
      })
    );
    return response.Items ?? [];
  }

  it('removes slots that vanish between replaces', async () => {
    const early = teeTime({ startInstant: '2026-07-10T06:00:00-06:00' });
    const later = teeTime({ startInstant: '2026-07-10T06:10:00-06:00' });
    await repository.replaceUnitTeeTimes(unit, [early, later]);

    await repository.replaceUnitTeeTimes(unit, [early]);

    const items = await storedItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.startInstant).toBe('2026-07-10T06:00:00-06:00');
  });

  it('stores otherwise-identical slots that differ only by routing as distinct records', async () => {
    const front = teeTime({ routing: ['Front'] });
    const back = teeTime({ routing: ['Back'] });

    await repository.replaceUnitTeeTimes(unit, [front, back]);

    const items = await storedItems();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item[TEE_TIME_TABLE_SORT_KEY]).sort()).toEqual([
      'greenbryre#2026-07-10T06:00:00-06:00#12#Back',
      'greenbryre#2026-07-10T06:00:00-06:00#12#Front',
    ]);
  });

  it('marshals a numeric TTL equal to the start instant in epoch seconds', async () => {
    await repository.replaceUnitTeeTimes(unit, [teeTime()]);

    const items = await storedItems();
    const expectedTtl = Math.floor(
      new Date('2026-07-10T06:00:00-06:00').getTime() / 1000
    );
    expect(items[0]?.[TEE_TIME_TABLE_TTL_ATTRIBUTE]).toBe(expectedTtl);
  });
});
