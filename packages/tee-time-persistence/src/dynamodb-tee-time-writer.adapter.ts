import {
  BatchWriteCommand,
  QueryCommand,
  type BatchWriteCommandInput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CourseId } from '@stt/tee-time-domain/primitives-schema';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type {
  ScrapeUnitKey,
  TeeTimeWriter,
} from '@stt/tee-time-domain/tee-time-writer';
import {
  TEE_TIME_TABLE_PARTITION_KEY,
  TEE_TIME_TABLE_SORT_KEY,
  TEE_TIME_TABLE_TTL_ATTRIBUTE,
} from './dynamodb-tee-time-table.js';

// Separates the sort key's segments (courseId#startInstant#holes#routing).
const KEY_SEGMENT_SEPARATOR = '#';
// Joins a multi-set routing (e.g. Front + Back) within its single key segment.
const ROUTING_SEGMENT_SEPARATOR = ',';
// Stable stand-in for an empty routing so the sort key keeps four segments.
const EMPTY_ROUTING_SENTINEL = '-';
// DynamoDB caps a single BatchWriteItem at 25 write requests.
const MAX_BATCH_WRITE_ITEMS = 25;
// Bound on retries of throttled/unprocessed batch items before giving up.
const MAX_BATCH_WRITE_ATTEMPTS = 8;

type WriteRequest = NonNullable<BatchWriteCommandInput['RequestItems']>[string][number];

type ItemKey = Record<string, string>;

/**
 * Persists tee times to DynamoDB, one `(courseId, date)` unit at a time, via
 * snapshot-replace.
 *
 * Items are keyed `PK = date`, `SK = courseId#startInstant#holes#routing` so all
 * of a day's courses share a partition (future per-date reads) while a unit's
 * items are addressable by the `courseId#` sort-key prefix (per-unit
 * reconciliation). Each item carries a numeric TTL equal to its start instant in
 * epoch seconds, so past dates fall out of the table without an explicit sweep.
 *
 * Replacement is non-transactional and self-healing: it queries the unit's
 * current keys, deletes those absent from the new set, and writes the new set in
 * chunked `BatchWriteItem` calls, retrying any `UnprocessedItems`.
 */
export class DynamoDbTeeTimeWriter implements TeeTimeWriter {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async replaceUnitTeeTimes(
    unit: ScrapeUnitKey,
    teeTimes: readonly TeeTime[]
  ): Promise<void> {
    const desiredItems = teeTimes.map((teeTime) => this.toItem(unit, teeTime));
    const desiredSortKeys = new Set(
      desiredItems.map((item) => item[TEE_TIME_TABLE_SORT_KEY] as string)
    );

    const existingKeys = await this.queryUnitKeys(unit);
    const staleKeys = existingKeys.filter(
      (key) => !desiredSortKeys.has(key[TEE_TIME_TABLE_SORT_KEY] ?? '')
    );

    const writes: WriteRequest[] = [
      ...staleKeys.map((Key) => ({ DeleteRequest: { Key } })),
      ...desiredItems.map((Item) => ({ PutRequest: { Item } })),
    ];
    await this.batchWrite(writes);
  }

  private toItem(unit: ScrapeUnitKey, teeTime: TeeTime): Record<string, unknown> {
    return {
      ...teeTime,
      [TEE_TIME_TABLE_PARTITION_KEY]: unit.date,
      [TEE_TIME_TABLE_SORT_KEY]: this.sortKey(unit.courseId, teeTime),
      [TEE_TIME_TABLE_TTL_ATTRIBUTE]: epochSeconds(teeTime.startInstant),
    };
  }

  private sortKey(courseId: CourseId, teeTime: TeeTime): string {
    const routing =
      teeTime.routing.length > 0
        ? teeTime.routing.join(ROUTING_SEGMENT_SEPARATOR)
        : EMPTY_ROUTING_SENTINEL;
    return [courseId, teeTime.startInstant, teeTime.holes, routing].join(
      KEY_SEGMENT_SEPARATOR
    );
  }

  private async queryUnitKeys(unit: ScrapeUnitKey): Promise<ItemKey[]> {
    const keys: ItemKey[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
          ExpressionAttributeNames: {
            '#pk': TEE_TIME_TABLE_PARTITION_KEY,
            '#sk': TEE_TIME_TABLE_SORT_KEY,
          },
          ExpressionAttributeValues: {
            ':pk': unit.date,
            ':prefix': `${unit.courseId}${KEY_SEGMENT_SEPARATOR}`,
          },
          ProjectionExpression: '#pk, #sk',
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      for (const item of response.Items ?? []) {
        keys.push({
          [TEE_TIME_TABLE_PARTITION_KEY]: item[TEE_TIME_TABLE_PARTITION_KEY] as string,
          [TEE_TIME_TABLE_SORT_KEY]: item[TEE_TIME_TABLE_SORT_KEY] as string,
        });
      }
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return keys;
  }

  private async batchWrite(writes: WriteRequest[]): Promise<void> {
    for (const chunk of chunkList(writes, MAX_BATCH_WRITE_ITEMS)) {
      let pending = chunk;

      for (let attempt = 0; pending.length > 0; attempt++) {
        if (attempt >= MAX_BATCH_WRITE_ATTEMPTS) {
          throw new Error(
            `DynamoDB left ${pending.length} items unprocessed for table "${this.tableName}" after ${attempt} attempts`
          );
        }
        if (attempt > 0) {
          await delay(backoffMs(attempt));
        }

        const response = await this.client.send(
          new BatchWriteCommand({ RequestItems: { [this.tableName]: pending } })
        );
        pending = response.UnprocessedItems?.[this.tableName] ?? [];
      }
    }
  }
}

function epochSeconds(instant: string): number {
  return Math.floor(new Date(instant).getTime() / 1000);
}

function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(50 * 2 ** attempt, 1000);
}
