/**
 * How a course's scraped dynamic price relates to tax.
 *
 * A platform may quote the raw green fee either tax-inclusive or pre-tax, so the
 * course declares which, plus the rate used to gross up a pre-tax price.
 */
export interface DynamicPricingTaxRule {
  // Whether the scraped price already includes tax; false means it must be grossed up.
  scrapedPriceIncludesTax: boolean;
  // Fractional tax rate applied to a pre-tax price, e.g. 0.11 for 11%.
  taxRate: number;
}

/**
 * A statically configured price for a subset of a course's slots.
 *
 * The optional fields narrow when the rule applies. Its `price` is authored after-tax.
 */
export interface PricingRule {
  // Hole count the rule applies to.
  holes: number;
  // Days of the week (0 = Sunday) the rule applies to; all days when omitted.
  daysOfWeek?: number[];
  // Inclusive local HH:mm lower bound; open when omitted.
  after?: string;
  // Exclusive local HH:mm upper bound; open when omitted.
  before?: string;
  // Specific local YYYY-MM-DD dates the rule applies to; all dates when omitted.
  dates?: string[];
  // After-tax per-player price for a matching slot.
  price: number;
}

/**
 * Per-course pricing configuration, keyed downstream by `courseId`.
 *
 * `tax` is present for any course that produces a dynamic price and omitted for
 * static-only courses; `rules` is an ordered list of static prices.
 */
export interface CoursePricingConfig {
  tax?: DynamicPricingTaxRule;
  rules: PricingRule[];
}
