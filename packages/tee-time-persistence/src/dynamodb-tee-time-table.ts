/**
 * The DynamoDB table's key and TTL attribute names.
 *
 * Shared between the persistence adapter (which marshals items) and the table
 * bootstrap (which creates the table and enables TTL) so both agree on a single
 * source of truth for the schema's attribute names.
 */

// Partition key: the local calendar date (`YYYY-MM-DD`), so all courses' times
// for a day share a partition for efficient future per-date reads.
export const TEE_TIME_TABLE_PARTITION_KEY = 'PK';

// Sort key: `courseId#startInstant#holes#routing`, so a single unit's items are
// addressable by the `courseId#` prefix for per-unit reconciliation.
export const TEE_TIME_TABLE_SORT_KEY = 'SK';

// Numeric TTL attribute (epoch seconds of the start instant) that evicts past
// dates whose partitions are no longer scraped.
export const TEE_TIME_TABLE_TTL_ATTRIBUTE = 'ttl';
