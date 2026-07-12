import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTextFetcher } from './http-text-fetcher.adapter.js';
import { TransportError } from './transport-error.js';

const url = 'https://leisure.saskatoon.ca/search.html';

// Stub the global fetch with a response carrying the given status/body/headers.
function stubFetch(opts: {
  ok: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}): void {
  const headers = new Headers(opts.headers ?? {});
  const response = {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    headers,
    text: vi.fn().mockResolvedValue(opts.body ?? ''),
  } as unknown as Response;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('HttpTextFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the response body as unparsed text on an OK response', async () => {
    stubFetch({ ok: true, body: '<html>tee times</html>' });
    const fetcher = new HttpTextFetcher();

    const result = await fetcher.fetchText(url);

    expect(result).toBe('<html>tee times</html>');
    expect(fetch).toHaveBeenCalledWith(url);
  });

  it('throws a TransportError with the status and parsed Retry-After on a non-OK response', async () => {
    stubFetch({ ok: false, status: 429, headers: { 'retry-after': '12' } });
    const fetcher = new HttpTextFetcher();

    const error = await fetcher.fetchText(url).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).status).toBe(429);
    expect((error as TransportError).retryAfterSeconds).toBe(12);
  });

  it('omits retryAfterSeconds when the header is absent', async () => {
    stubFetch({ ok: false, status: 503 });
    const fetcher = new HttpTextFetcher();

    const error = await fetcher.fetchText(url).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).status).toBe(503);
    expect((error as TransportError).retryAfterSeconds).toBeUndefined();
  });
});
