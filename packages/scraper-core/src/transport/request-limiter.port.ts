/**
 * Runs scheduled work under the request limits for a given host.
 *
 * The single `schedule` surface is deliberately narrow so the limiting library
 * stays hidden behind this port: callers depend only on "run this `fn` under
 * `host`'s limits", never on how the throttling, retrying, or pausing is done.
 */
export interface RequestLimiter {
  /**
   * Run `fn` once capacity is available for `host`, resolving with its result.
   *
   * @param host - Hostname the work targets; jobs are keyed and throttled per host.
   * @param fn - The work to run under the host's limits.
   * @returns `fn`'s resolved value, or a rejection carrying `fn`'s error.
   */
  schedule<T>(host: string, fn: () => Promise<T>): Promise<T>;
}
