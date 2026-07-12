import { describe, expect, it, vi } from 'vitest';
import { HostLimitedTextFetcher } from './host-limited-text-fetcher.adapter.js';
import type { RequestLimiter } from './request-limiter.port.js';
import type { TextFetcher } from './text-fetcher.port.js';

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

describe('HostLimitedTextFetcher', () => {
  it('schedules the inner fetch under the hostname parsed from the url', async () => {
    const { limiter, hosts } = recordingLimiter();
    const inner: TextFetcher = { fetchText: vi.fn().mockResolvedValue('') };
    const decorator = new HostLimitedTextFetcher(inner, limiter);

    await decorator.fetchText('https://leisure.saskatoon.ca/search.html?id=5');

    expect(hosts).toEqual(['leisure.saskatoon.ca']);
    expect(inner.fetchText).toHaveBeenCalledWith(
      'https://leisure.saskatoon.ca/search.html?id=5'
    );
  });

  it('returns the inner fetcher result unchanged', async () => {
    const { limiter } = recordingLimiter();
    const body = '<html>tee times</html>';
    const inner: TextFetcher = { fetchText: vi.fn().mockResolvedValue(body) };
    const decorator = new HostLimitedTextFetcher(inner, limiter);

    const result = await decorator.fetchText('https://example.com/data');

    expect(result).toBe(body);
  });

  it('reaches the inner fetcher only through the limiter', async () => {
    const inner: TextFetcher = { fetchText: vi.fn().mockResolvedValue('') };
    // A limiter that never invokes the work must leave the inner fetcher untouched.
    const blockingLimiter: RequestLimiter = { schedule: () => new Promise(() => {}) };
    const decorator = new HostLimitedTextFetcher(inner, blockingLimiter);

    void decorator.fetchText('https://example.com/data');
    await Promise.resolve();

    expect(inner.fetchText).not.toHaveBeenCalled();
  });
});
