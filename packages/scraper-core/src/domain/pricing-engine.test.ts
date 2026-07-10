import { describe, expect, it } from 'vitest';
import { greenbryrePricingConfig } from '../platforms/chronogolf-v1/courses/greenbryre.js';
import { applyTax, PricingEngine, type CoursePricingConfig } from './pricing-engine.js';
import type { ScrapedTeeTime } from './tee-time.schema.js';

const scraped: ScrapedTeeTime = {
  startInstant: '2026-07-11T06:00:00-06:00',
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  holes: 12,
  routing: [],
  groupSizes: [2, 3, 4],
  bookingUrls: { 2: 'https://example.com' },
  scrapedAt: '2026-07-10T18:00:00Z',
  dynamicPrice: 52.7,
};

function engineFor(config: CoursePricingConfig): PricingEngine {
  return new PricingEngine(new Map([['greenbryre', config]]));
}

describe('applyTax', () => {
  it('grosses up a pre-tax price and rounds to cents', () => {
    const taxed = applyTax(
      52.7,
      { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      'greenbryre'
    );

    expect(taxed).toBe(58.5);
  });

  it('passes a tax-inclusive price through untouched', () => {
    const taxed = applyTax(
      60,
      { scrapedPriceIncludesTax: true, taxRate: 0.11 },
      'greenbryre'
    );

    expect(taxed).toBe(60);
  });

  it('throws naming the course when no tax rule is configured', () => {
    expect(() => applyTax(52.7, undefined, 'greenbryre')).toThrow(/greenbryre/);
  });
});

describe('PricingEngine', () => {
  it('resolves a dynamic price to its after-tax value and drops dynamicPrice', () => {
    const engine = engineFor({
      tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      rules: [],
    });

    const teeTime = engine.enrich(scraped);

    expect(teeTime.pricePerPlayer).toBe(58.5);
    expect('dynamicPrice' in teeTime).toBe(false);
  });

  it('carries every other field through unchanged', () => {
    const engine = engineFor({
      tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      rules: [],
    });

    const teeTime = engine.enrich(scraped);

    expect(teeTime).toEqual({
      startInstant: scraped.startInstant,
      courseId: scraped.courseId,
      courseName: scraped.courseName,
      holes: scraped.holes,
      routing: scraped.routing,
      groupSizes: scraped.groupSizes,
      bookingUrls: scraped.bookingUrls,
      scrapedAt: scraped.scrapedAt,
      pricePerPlayer: 58.5,
    });
  });

  it('throws naming the course when a dynamic price has no tax rule', () => {
    const engine = engineFor({ rules: [] });

    expect(() => engine.enrich(scraped)).toThrow(/greenbryre/);
  });

  it('resolves a null dynamic price to null through the static stub', () => {
    const engine = engineFor({
      tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      rules: [],
    });

    const teeTime = engine.enrich({ ...scraped, dynamicPrice: null });

    expect(teeTime.pricePerPlayer).toBeNull();
  });

  it('throws for a course with no pricing config', () => {
    const engine = new PricingEngine(new Map());

    expect(() => engine.enrich(scraped)).toThrow(/greenbryre/);
  });
});

describe('PricingEngine with the real Greenbryre config', () => {
  // Greenbryre fixtures encode the raw green fee as pre-tax; the engine must
  // gross it up so pricePerPlayer is the after-tax value users see.
  it('grosses up the pre-tax green fee to after-tax CAD', () => {
    const engine = engineFor(greenbryrePricingConfig);

    const teeTime = engine.enrich({ ...scraped, dynamicPrice: 52.7 });

    expect(teeTime.pricePerPlayer).toBe(58.5);
  });
});
