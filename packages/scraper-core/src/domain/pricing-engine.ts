import type {
  CoursePricingConfig,
  DynamicPricingTaxRule,
  PricingRule,
} from '@stt/tee-time-domain/course-pricing-config';
import type { CourseId } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime, TeeTime } from '@stt/tee-time-domain/tee-time-schema';

/**
 * Normalize a scraped dynamic price to after-tax CAD.
 *
 * Passes a tax-inclusive price through and grosses up a pre-tax one by the tax
 * rate, rounded to cents. Throws when a course produced a dynamic price but has
 * no tax rule configured.
 *
 * @param price - The raw per-player price as scraped.
 * @param tax - The course's tax rule, if configured.
 * @param courseId - The course the price belongs to, named in the error.
 * @returns The after-tax per-player price.
 */
export function applyTax(
  price: number,
  tax: DynamicPricingTaxRule | undefined,
  courseId: CourseId
): number {
  if (!tax) {
    throw new Error(
      `Course "${courseId}" produced a dynamic price but has no tax rule configured`
    );
  }
  if (tax.scrapedPriceIncludesTax) {
    return price;
  }
  return Math.round(price * (1 + tax.taxRate) * 100) / 100;
}

/**
 * Resolve a statically configured after-tax price for a slot by first-match rule evaluation.
 *
 *
 * @param scraped - The scraped tee time to price.
 * @param rules - The course's ordered static pricing rules.
 * @returns The after-tax static price, or `null` when none resolves.
 */
export function resolveStatic(
  scraped: ScrapedTeeTime,
  rules: readonly PricingRule[]
): number | null {
  const localDate = scraped.startInstant.slice(0, 10);
  const localTime = scraped.startInstant.slice(11, 16);
  const localDayOfWeek = new Date(`${localDate}T00:00:00Z`).getUTCDay();

  const match = rules.find((rule) => {
    if (rule.holes !== scraped.holes) {
      return false;
    }
    if (rule.daysOfWeek && !rule.daysOfWeek.includes(localDayOfWeek)) {
      return false;
    }
    if (rule.after && localTime < rule.after) {
      return false;
    }
    if (rule.before && localTime >= rule.before) {
      return false;
    }
    if (rule.dates && !rule.dates.includes(localDate)) {
      return false;
    }
    return true;
  });

  return match?.price ?? null;
}

/**
 * Finalizes a scraped tee time's price into the canonical persisted {@link TeeTime}.
 *
 * The single authority for `pricePerPlayer`: it prefers the tax-normalized
 * dynamic price, falls back to a statically resolved price, then `null`. It drops
 * the raw `dynamicPrice` and passes every other field through unchanged.
 */
export class PricingEngine {
  constructor(
    private readonly configsByCourseId: ReadonlyMap<CourseId, CoursePricingConfig>
  ) {}

  /**
   * Enrich a scraped tee time into the canonical persisted tee time.
   *
   * @param scraped - The tee time as scraped, carrying the raw dynamic price.
   * @returns The canonical tee time with a resolved after-tax `pricePerPlayer`.
   *
   * @example
   * ```typescript
   * const teeTime = pricingEngine.enrich(scrapedTeeTime);
   * ```
   */
  enrich(scraped: ScrapedTeeTime): TeeTime {
    const config = this.configsByCourseId.get(scraped.courseId);
    if (!config) {
      throw new Error(`No pricing config for course "${scraped.courseId}"`);
    }

    const { dynamicPrice, ...shared } = scraped;
    const pricePerPlayer =
      (dynamicPrice == null
        ? null
        : applyTax(dynamicPrice, config.tax, scraped.courseId)) ??
      resolveStatic(scraped, config.rules);

    return { ...shared, pricePerPlayer };
  }
}
