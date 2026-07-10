import { describe, expect, it, vi } from 'vitest';
import { HostLimitedJsonFetcher } from './host-limited-json-fetcher.adapter.js';
import type { JsonFetcher } from './json-fetcher.port.js';
import type { RequestLimiter } from './request-limiter.port.js';

// A limiter that records the host it was scheduled under and runs the work.
function recordingLimiter(): { limiter: RequestLimiter; hosts: string[] } {
  const hosts: string[] = [];
  const limiter: RequestLimiter = {
    schedule<T>(host: string, fn: () => Promise<T>): Promise<T> {
      hosts.push(host);
      return fn();
    },
  };
  return { limiter, hosts };
}

describe('HostLimitedJsonFetcher', () => {
  it('schedules the inner fetch under the hostname parsed from the url', async () => {
    const { limiter, hosts } = recordingLimiter();
    const inner: JsonFetcher = { fetchJson: vi.fn().mockResolvedValue({}) };
    const decorator = new HostLimitedJsonFetcher(inner, limiter);

    await decorator.fetchJson('https://www.chronogolf.ca/tee_times?id=5');

    expect(hosts).toEqual(['www.chronogolf.ca']);
    expect(inner.fetchJson).toHaveBeenCalledWith(
      'https://www.chronogolf.ca/tee_times?id=5'
    );
  });

  it('returns the inner fetcher result unchanged', async () => {
    const { limiter } = recordingLimiter();
    const payload = { teeTimes: [1, 2, 3] };
    const inner: JsonFetcher = { fetchJson: vi.fn().mockResolvedValue(payload) };
    const decorator = new HostLimitedJsonFetcher(inner, limiter);

    const result = await decorator.fetchJson('https://example.com/data');

    expect(result).toBe(payload);
  });

  it('reaches the inner fetcher only through the limiter', async () => {
    const inner: JsonFetcher = { fetchJson: vi.fn().mockResolvedValue({}) };
    // A limiter that never invokes the work must leave the inner fetcher untouched.
    const blockingLimiter: RequestLimiter = { schedule: () => new Promise(() => {}) };
    const decorator = new HostLimitedJsonFetcher(inner, blockingLimiter);

    void decorator.fetchJson('https://example.com/data');
    await Promise.resolve();

    expect(inner.fetchJson).not.toHaveBeenCalled();
  });
});
