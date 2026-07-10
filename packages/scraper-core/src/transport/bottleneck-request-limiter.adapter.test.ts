import { describe, expect, it } from 'vitest';
import { BottleneckRequestLimiter } from './bottleneck-request-limiter.adapter.js';
import type { RequestLimiterConfig } from './request-limiter-config.schema.js';
import { TransportError } from './transport-error.js';

const url = 'https://host/path';

function makeConfig(opts: {
  maxConcurrent?: number;
  browserPageCeiling?: number;
  maxAttempts?: number;
  maxRetryAfterSeconds?: number;
  overrides?: Record<string, { maxConcurrent: number }>;
}): RequestLimiterConfig {
  return {
    perHost: {
      default: { maxConcurrent: opts.maxConcurrent ?? 3 },
      overrides: opts.overrides ?? {},
    },
    browserPageCeiling: opts.browserPageCeiling ?? 100,
    retry: {
      maxAttempts: opts.maxAttempts ?? 3,
      maxRetryAfterSeconds: opts.maxRetryAfterSeconds ?? 30,
    },
  };
}

// Tracks live/peak concurrency across a batch of jobs whose completion the test
// controls by resolving each job's gate.
function createTracker() {
  const state = { running: 0, started: 0, maxRunning: 0 };
  const gates: Array<() => void> = [];

  function gatedJob(): () => Promise<string> {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    gates.push(open);
    return async () => {
      state.running += 1;
      state.started += 1;
      state.maxRunning = Math.max(state.maxRunning, state.running);
      await gate;
      state.running -= 1;
      return 'ok';
    };
  }

  return { state, gatedJob, releaseAll: () => gates.forEach((open) => open()) };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('BottleneckRequestLimiter', () => {
  describe('per-host concurrency cap', () => {
    it('runs no more than the per-host cap for a single host, queuing the rest', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxConcurrent: 2 }));
      const tracker = createTracker();

      const jobs = Array.from({ length: 5 }, () =>
        limiter.schedule('host-a', tracker.gatedJob())
      );
      await waitFor(() => tracker.state.started === 2);
      await settle(30);

      expect(tracker.state.started).toBe(2);
      expect(tracker.state.running).toBe(2);

      tracker.releaseAll();
      await Promise.all(jobs);
      expect(tracker.state.maxRunning).toBe(2);
    });

    it('gives different hosts independent budgets', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxConcurrent: 2 }));
      const tracker = createTracker();

      const jobs = [
        limiter.schedule('host-a', tracker.gatedJob()),
        limiter.schedule('host-a', tracker.gatedJob()),
        limiter.schedule('host-b', tracker.gatedJob()),
        limiter.schedule('host-b', tracker.gatedJob()),
      ];
      await waitFor(() => tracker.state.started === 4);

      expect(tracker.state.running).toBe(4);

      tracker.releaseAll();
      await Promise.all(jobs);
    });
  });

  describe('global browser-page ceiling', () => {
    it('never runs more jobs at once than the ceiling', async () => {
      const limiter = new BottleneckRequestLimiter(
        makeConfig({ maxConcurrent: 3, browserPageCeiling: 4 })
      );
      const tracker = createTracker();

      const jobs = [
        ...Array.from({ length: 3 }, () =>
          limiter.schedule('host-a', tracker.gatedJob())
        ),
        ...Array.from({ length: 3 }, () =>
          limiter.schedule('host-b', tracker.gatedJob())
        ),
      ];
      await waitFor(() => tracker.state.started === 4);
      await settle(30);

      expect(tracker.state.running).toBe(4);
      expect(tracker.state.started).toBe(4);

      tracker.releaseAll();
      await Promise.all(jobs);
      expect(tracker.state.maxRunning).toBe(4);
    });

    it('does not starve a free host behind a busy host (no head-of-line blocking)', async () => {
      const limiter = new BottleneckRequestLimiter(
        makeConfig({ maxConcurrent: 3, browserPageCeiling: 4 })
      );
      const tracker = createTracker();

      // host-a fills its cap (3 running) and queues a 4th job waiting on host-a
      // capacity — that queued job must NOT hold the remaining global slot.
      const busyJobs = Array.from({ length: 4 }, () =>
        limiter.schedule('host-a', tracker.gatedJob())
      );
      await waitFor(() => tracker.state.started === 3);

      let freeHostRan = false;
      const freeJob = limiter.schedule('host-b', async () => {
        freeHostRan = true;
        return 'b';
      });

      await waitFor(() => freeHostRan);
      expect(freeHostRan).toBe(true);

      tracker.releaseAll();
      await Promise.all([...busyJobs, freeJob]);
    });
  });

  describe('retry policy', () => {
    it('retries a within-threshold retry-after until the job succeeds', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxAttempts: 3 }));
      let calls = 0;

      const result = await limiter.schedule('host-a', async () => {
        calls += 1;
        if (calls === 1) throw new TransportError(429, 0.02, url);
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(calls).toBe(2);
    });

    it('gives up without pausing when the retry-after exceeds the threshold', async () => {
      const limiter = new BottleneckRequestLimiter(
        makeConfig({ maxRetryAfterSeconds: 30 })
      );
      let calls = 0;

      await expect(
        limiter.schedule('host-a', async () => {
          calls += 1;
          throw new TransportError(429, 100, url);
        })
      ).rejects.toBeInstanceOf(TransportError);
      expect(calls).toBe(1);

      // The host was not paused: a following job runs promptly.
      const start = Date.now();
      await expect(limiter.schedule('host-a', async () => 'ok')).resolves.toBe('ok');
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('gives up once the maximum attempts are exhausted', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxAttempts: 2 }));
      let calls = 0;

      await expect(
        limiter.schedule('host-a', async () => {
          calls += 1;
          throw new TransportError(429, 0.01, url);
        })
      ).rejects.toBeInstanceOf(TransportError);
      // initial attempt + 2 retries, then it gives up.
      expect(calls).toBe(3);
    });

    it('does not retry a non-retryable error and propagates it unchanged', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({}));
      let calls = 0;
      const error = new TransportError(500, undefined, url);

      await expect(
        limiter.schedule('host-a', async () => {
          calls += 1;
          throw error;
        })
      ).rejects.toBe(error);
      expect(calls).toBe(1);
    });
  });

  describe('per-host circuit pause', () => {
    it('pauses only the offending host while other hosts keep flowing', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxAttempts: 1 }));
      let hostAFailCalls = 0;
      // ~120ms pause window, retried once then given up (maxAttempts 1).
      const hostAPromise = limiter
        .schedule('host-a', async () => {
          hostAFailCalls += 1;
          throw new TransportError(429, 0.12, url);
        })
        .catch((error: unknown) => error);

      await waitFor(() => hostAFailCalls === 1);
      await settle(10); // let the reservoir-0 pause take effect

      // A different host is unaffected by host-a's pause.
      await expect(limiter.schedule('host-b', async () => 'b-ok')).resolves.toBe(
        'b-ok'
      );

      // A new host-a job does not start while host-a is paused.
      let hostA2Started = false;
      const hostA2Promise = limiter.schedule('host-a', async () => {
        hostA2Started = true;
        return 'a2';
      });
      await settle(40);
      expect(hostA2Started).toBe(false);

      // Once the window elapses the host resumes: the queued job runs and the
      // exhausted failing job surfaces its error.
      expect(await hostAPromise).toBeInstanceOf(TransportError);
      expect(await hostA2Promise).toBe('a2');
      expect(hostA2Started).toBe(true);
    });

    it('resumes the host only after the pause window elapses', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxAttempts: 3 }));
      let calls = 0;
      const start = Date.now();

      const result = await limiter.schedule('host-a', async () => {
        calls += 1;
        if (calls === 1) throw new TransportError(429, 0.1, url);
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(calls).toBe(2);
      // The retry only ran after the ~100ms resume window.
      expect(Date.now() - start).toBeGreaterThanOrEqual(80);
    });

    it('extends rather than stacks concurrent pauses for the same host', async () => {
      const limiter = new BottleneckRequestLimiter(makeConfig({ maxAttempts: 3 }));
      let first = 0;
      let second = 0;
      const start = Date.now();

      // Both jobs run at once (cap 3), fail near-simultaneously each asking for a
      // ~150ms window, then succeed on retry.
      const [r1, r2] = await Promise.all([
        limiter.schedule('host-a', async () => {
          first += 1;
          if (first === 1) throw new TransportError(429, 0.15, url);
          return '1';
        }),
        limiter.schedule('host-a', async () => {
          second += 1;
          if (second === 1) throw new TransportError(429, 0.15, url);
          return '2';
        }),
      ]);
      const elapsed = Date.now() - start;

      expect([r1, r2]).toEqual(['1', '2']);
      // A single extended ~150ms window, not two stacked (~300ms) windows.
      expect(elapsed).toBeGreaterThanOrEqual(120);
      expect(elapsed).toBeLessThan(280);
    });
  });
});
