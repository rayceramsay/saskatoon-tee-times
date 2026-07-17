import type { TeeTime } from '../tee-time-response.schema';

/**
 * Build a valid {@link TeeTime} for tests, overriding only the fields under test.
 *
 * @param overrides - Fields to replace on the canonical default slot.
 * @returns A complete tee time.
 */
export function makeTeeTime(overrides: Partial<TeeTime> = {}): TeeTime {
  return {
    startInstant: '2026-07-13T08:00:00-06:00',
    courseId: 'the-willows',
    courseName: 'The Willows',
    holes: 18,
    routing: ['Front', 'Back'],
    groupSizes: [1, 2, 3, 4],
    booking: { kind: 'reservation', urls: { 4: 'https://book.example/willows/4' } },
    scrapedAt: '2026-07-13T13:45:00Z',
    pricePerPlayer: 58,
    ...overrides,
  };
}
