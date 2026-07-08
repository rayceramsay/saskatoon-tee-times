import type { ScrapedTeeTime, TeeTime } from './tee-time.schema.js';

/**
 * Map a scraped tee time to the canonical persisted {@link TeeTime}.
 *
 * A pass-through for this slice: every shared field is carried over unchanged
 * and `pricePerPlayer` is taken directly from the raw `dynamicPrice` (including
 * null), with no tax normalization or static-rule resolution. This keeps the
 * pricing seam's shape intact so a real pricing engine can later replace this
 * mapper without touching the persisted schema or the repository.
 *
 * @param scraped - The tee time as scraped from a booking platform.
 * @returns The canonical tee time to persist.
 *
 * @example
 * ```typescript
 * const teeTime = toTeeTime(scrapedTeeTime);
 * ```
 */
export function toTeeTime(scraped: ScrapedTeeTime): TeeTime {
  const { dynamicPrice, ...shared } = scraped;
  return { ...shared, pricePerPlayer: dynamicPrice };
}
