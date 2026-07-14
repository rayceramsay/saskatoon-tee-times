import { describe, expect, it, vi } from 'vitest';
import type { CapturedJsonFetcher } from './captured-json-fetcher.port.js';
import { HostLimitedCapturedJsonFetcher } from './host-limited-captured-json-fetcher.adapter.js';
import type { RequestLimiter } from './request-limiter.port.js';

const pageUrl = 'https://admin.teeon.com/portal?facility_id=477&date=2026-07-20';
const responseUrlPrefix =
  'https://admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=2026-07-20';

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

describe('HostLimitedCapturedJsonFetcher', () => {
  it('schedules the inner capture under the hostname parsed from the page url', async () => {
    const { limiter, hosts } = recordingLimiter();
    const inner: CapturedJsonFetcher = { capture: vi.fn().mockResolvedValue({}) };
    const decorator = new HostLimitedCapturedJsonFetcher(inner, limiter);

    await decorator.capture(pageUrl, responseUrlPrefix);

    expect(hosts).toEqual(['admin.teeon.com']);
    expect(inner.capture).toHaveBeenCalledWith(pageUrl, responseUrlPrefix);
  });

  it('returns the inner fetcher result unchanged', async () => {
    const { limiter } = recordingLimiter();
    const payload = { teeTimes: [1, 2, 3] };
    const inner: CapturedJsonFetcher = { capture: vi.fn().mockResolvedValue(payload) };
    const decorator = new HostLimitedCapturedJsonFetcher(inner, limiter);

    const result = await decorator.capture(pageUrl, responseUrlPrefix);

    expect(result).toBe(payload);
  });

  it('reaches the inner fetcher only through the limiter', async () => {
    const inner: CapturedJsonFetcher = { capture: vi.fn().mockResolvedValue({}) };
    // A limiter that never invokes the work must leave the inner fetcher untouched.
    const blockingLimiter: RequestLimiter = { schedule: () => new Promise(() => {}) };
    const decorator = new HostLimitedCapturedJsonFetcher(inner, blockingLimiter);

    void decorator.capture(pageUrl, responseUrlPrefix);
    await Promise.resolve();

    expect(inner.capture).not.toHaveBeenCalled();
  });
});
