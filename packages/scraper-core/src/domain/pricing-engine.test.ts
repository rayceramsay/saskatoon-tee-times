import { describe, expect, it } from 'vitest';
import { greenbryrePricingConfig } from '../platforms/chronogolf-v1/courses/greenbryre.js';
import {
  applyTax,
  PricingEngine,
  resolveStatic,
  type CoursePricingConfig,
} from './pricing-engine.js';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';

const scraped: ScrapedTeeTime = {
  startInstant: '2026-07-11T06:00:00-06:00',
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  holes: 12,
  routing: [],
  groupSizes: [2, 3, 4],
  booking: { kind: 'reservation', urls: { 2: 'https://example.com' } },
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
      booking: scraped.booking,
      scrapedAt: scraped.scrapedAt,
      pricePerPlayer: 58.5,
    });
  });

  it('carries every booking arm through enrichment unchanged', () => {
    const engine = engineFor({
      tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      rules: [],
    });
    const arms = [
      { kind: 'reservation', urls: { 2: 'https://example.com/book/2' } },
      { kind: 'portal', url: 'https://example.com/portal?date=2026-07-11' },
      { kind: 'phone' },
    ] as const;

    for (const booking of arms) {
      expect(engine.enrich({ ...scraped, booking }).booking).toEqual(booking);
    }
  });

  it('leaves a priced phone slot on the phone arm', () => {
    const engine = engineFor({
      tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
      rules: [],
    });

    const teeTime = engine.enrich({ ...scraped, booking: { kind: 'phone' } });

    expect(teeTime.pricePerPlayer).toBe(58.5);
    expect(teeTime.booking).toEqual({ kind: 'phone' });
  });

  it('throws naming the course when a dynamic price has no tax rule', () => {
    const engine = engineFor({ rules: [] });

    expect(() => engine.enrich(scraped)).toThrow(/greenbryre/);
  });

  it('resolves a null dynamic price to a matching static rule', () => {
    const engine = engineFor({ rules: [{ holes: 12, price: 40 }] });

    const teeTime = engine.enrich({ ...scraped, dynamicPrice: null });

    expect(teeTime.pricePerPlayer).toBe(40);
  });

  it('resolves a null dynamic price to null when no static rule matches', () => {
    const engine = engineFor({ rules: [] });

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

describe('resolveStatic', () => {
  // 2026-07-08 is a Wednesday (day 3), 2026-07-11 a Saturday (day 6).
  const wednesday: ScrapedTeeTime = {
    ...scraped,
    holes: 18,
    startInstant: '2026-07-08T08:00:00-06:00',
    dynamicPrice: null,
  };
  const saturday: ScrapedTeeTime = {
    ...wednesday,
    startInstant: '2026-07-11T08:00:00-06:00',
  };

  it('returns the price of the first matching rule', () => {
    const price = resolveStatic(wednesday, [
      { holes: 18, price: 42 },
      { holes: 18, price: 99 },
    ]);

    expect(price).toBe(42);
  });

  it('narrows by hole count and weekday/weekend day of week', () => {
    const rules = [
      { holes: 18, daysOfWeek: [1, 2, 3, 4], price: 42 },
      { holes: 18, daysOfWeek: [5, 6, 0], price: 45 },
    ];

    expect(resolveStatic(wednesday, rules)).toBe(42);
    expect(resolveStatic(saturday, rules)).toBe(45);
  });

  it('returns null when no rule matches the hole count', () => {
    const price = resolveStatic(wednesday, [{ holes: 9, price: 25 }]);

    expect(price).toBeNull();
  });

  it('applies the after/before window on the [after, before) boundaries', () => {
    const rules = [{ holes: 18, after: '08:00', before: '12:00', price: 30 }];

    expect(resolveStatic(wednesday, rules)).toBe(30);
    expect(
      resolveStatic({ ...wednesday, startInstant: '2026-07-08T12:00:00-06:00' }, rules)
    ).toBeNull();
    expect(
      resolveStatic({ ...wednesday, startInstant: '2026-07-08T07:59:00-06:00' }, rules)
    ).toBeNull();
  });

  it('derives local day and time from the start instant offset, not UTC', () => {
    // Local Saturday 23:30 in America/Regina is Sunday 05:30 UTC; matching on the
    // UTC instant would read the wrong day (0) and time (05:30).
    const lateSaturday: ScrapedTeeTime = {
      ...saturday,
      startInstant: '2026-07-11T23:30:00-06:00',
    };

    const price = resolveStatic(lateSaturday, [
      { holes: 18, daysOfWeek: [6], after: '20:00', price: 45 },
    ]);

    expect(price).toBe(45);
  });
});
