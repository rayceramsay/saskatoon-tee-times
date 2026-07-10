import { describe, expect, it } from 'vitest';
import { TransportError } from './transport-error.js';

describe('TransportError', () => {
  it('exposes the status and parsed retry-after when the header was present', () => {
    const error = new TransportError(429, 30, 'https://www.chronogolf.ca/tee_times');

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('exposes the status with an absent retry-after when the header was missing', () => {
    const error = new TransportError(
      503,
      undefined,
      'https://www.chronogolf.ca/tee_times'
    );

    expect(error.status).toBe(503);
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('names the failing url in its message', () => {
    const error = new TransportError(429, 30, 'https://www.chronogolf.ca/tee_times');

    expect(error.message).toContain('https://www.chronogolf.ca/tee_times');
  });
});
