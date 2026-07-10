import Bottleneck from 'bottleneck';
import type { RequestLimiter } from './request-limiter.port.js';
import type { RequestLimiterConfig } from './request-limiter.config.js';
import { computeRetryWaitMs, isRetryable } from './retry-policy.js';

/**
 * A {@link RequestLimiter} backed by [`bottleneck`](https://www.npmjs.com/package/bottleneck).
 *
 * This is the only file that references `bottleneck`; the library never leaks
 * past the {@link RequestLimiter} port. It composes two concurrency axes:
 *
 * - **Per host** (server politeness): a `Bottleneck.Group` keyed by hostname, so
 *   each host gets its own child limiter capped at its `maxConcurrent`.
 * - **Global page ceiling** (machine compute): a single parent limiter every
 *   child is chained under, so a job starts only when both a host slot and a
 *   global slot are free — with no head-of-line blocking on a busy host.
 *
 * On a retryable failure (429/503) within threshold it retries the failing job
 * and circuit-pauses only the offending host for the backoff window; other hosts
 * keep flowing.
 */
export class BottleneckRequestLimiter implements RequestLimiter {
  private readonly parent: Bottleneck;
  private readonly group: Bottleneck.Group;
  private readonly pauses = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; resumeAt: number }
  >();

  constructor(private readonly config: RequestLimiterConfig) {
    // Axis B — the global browser-page ceiling shared across every host.
    this.parent = new Bottleneck({ maxConcurrent: config.browserPageCeiling });

    // Axis A — one child limiter per hostname, seeded with the default cap.
    this.group = new Bottleneck.Group({
      maxConcurrent: config.perHost.default.maxConcurrent,
    });

    // Wire each child the moment the Group lazily creates it (chain to the
    // ceiling, apply any override, attach the retry/pause handler).
    this.group.on('created', (limiter, host) => this.configureChild(limiter, host));
  }

  schedule<T>(host: string, fn: () => Promise<T>): Promise<T> {
    return this.group.key(host).schedule(fn);
  }

  private configureChild(limiter: Bottleneck, host: string): void {
    // Axis B: a job runs only when the global ceiling also has a free slot.
    limiter.chain(this.parent);

    // A host inherits the default cap unless it carries an explicit override.
    const override = this.config.perHost.overrides[host];
    if (override) {
      void limiter.updateSettings({ maxConcurrent: override.maxConcurrent });
    }

    const { maxAttempts, maxRetryAfterSeconds } = this.config.retry;
    limiter.on('failed', async (error, info) => {
      if (!isRetryable(error)) return;
      if (info.retryCount >= maxAttempts) return;

      const waitMs = computeRetryWaitMs(error, info.retryCount);
      if (waitMs > maxRetryAfterSeconds * 1000) return;

      // Back the whole host off for the window, then retry this job after it.
      await this.pauseHost(host, waitMs);
      return waitMs;
    });
  }

  /**
   * Pause every new job for `host` until its resume time, then auto-resume.
   *
   * Concurrent backoff signals for the same host are deduplicated: the window is
   * extended to the latest resume time rather than stacked, and resume targets
   * the live limiter via `group.key(host)` so it holds even if the Group recycled
   * an idle child.
   */
  private async pauseHost(host: string, waitMs: number): Promise<void> {
    const existing = this.pauses.get(host);
    const resumeAt = Math.max(Date.now() + waitMs, existing?.resumeAt ?? 0);
    if (existing) clearTimeout(existing.timer);

    // reservoir 0 gates new starts only; in-flight jobs for the host may finish.
    await this.group.key(host).updateSettings({ reservoir: 0 });

    const timer = setTimeout(() => {
      // reservoir null re-disables the reservoir so only maxConcurrent applies.
      void this.group.key(host).updateSettings({ reservoir: null });
      this.pauses.delete(host);
    }, resumeAt - Date.now());

    this.pauses.set(host, { timer, resumeAt });
  }
}
