import { ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { TeeTimeReader } from '@stt/tee-time-domain/tee-time-reader';
import { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { TEE_TIME_TABLE_PARTITION_KEY } from './dynamodb-tee-time-table.js';

/**
 * Reads tee times from DynamoDB, one local calendar date at a time.
 *
 * Because a date's items all share the `PK = date` partition, a date is read
 * with a single `Query` on that partition — no scan or secondary index — paging
 * on `LastEvaluatedKey` until the partition is exhausted. Each stored item is
 * parsed back through the `TeeTime` schema, dropping the storage-only `PK`/`SK`/
 * `ttl` attributes so only canonical `TeeTime` fields leak outward.
 *
 * A missing table resolves to an empty set rather than raising, so a read side
 * started before the write side has provisioned the table degrades gracefully.
 */
export class DynamoDbTeeTimeReader implements TeeTimeReader {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async readTeeTimesForDate(date: string): Promise<readonly TeeTime[]> {
    const teeTimes: TeeTime[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    try {
      do {
        const response = await this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :date',
            ExpressionAttributeNames: { '#pk': TEE_TIME_TABLE_PARTITION_KEY },
            ExpressionAttributeValues: { ':date': date },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        for (const item of response.Items ?? []) {
          teeTimes.push(TeeTime.parse(item));
        }
        exclusiveStartKey = response.LastEvaluatedKey;
      } while (exclusiveStartKey);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return [];
      }
      throw error;
    }

    return teeTimes;
  }
}
