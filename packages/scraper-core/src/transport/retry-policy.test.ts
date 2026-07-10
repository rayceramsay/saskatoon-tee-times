import { describe, expect, it } from 'vitest';
import { computeRetryWaitMs, isRetryable } from './retry-policy.js';
import { TransportError } from './transport-error.js';

const url = 'https://www.chronogolf.ca/tee_times';

describe('isRetryable', () => {
  it('is true for the back-off statuses (429, 503)', () => {
    expect(isRetryable(new TransportError(429, undefined, url))).toBe(true);
    expect(isRetryable(new TransportError(503, undefined, url))).toBe(true);
  });

  it('is false for other transport statuses', () => {
    expect(isRetryable(new TransportError(404, undefined, url))).toBe(false);
    expect(isRetryable(new TransportError(500, undefined, url))).toBe(false);
  });

  it('is false for non-transport errors', () => {
    expect(isRetryable(new Error('boom'))).toBe(false);
    expect(isRetryable('not an error')).toBe(false);
  });
});

describe('computeRetryWaitMs', () => {
  it('honors the server-provided retry-after in milliseconds', () => {
    const error = new TransportError(429, 12, url);

    expect(computeRetryWaitMs(error, 0)).toBe(12000);
  });

  it('falls back to exponential backoff keyed on retry count when retry-after is absent', () => {
    const error = new TransportError(503, undefined, url);

    expect(computeRetryWaitMs(error, 0)).toBe(1000);
    expect(computeRetryWaitMs(error, 1)).toBe(2000);
    expect(computeRetryWaitMs(error, 2)).toBe(4000);
  });
});
