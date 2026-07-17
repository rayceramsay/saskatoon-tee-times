import type { Logger } from '@stt/tee-time-domain/logger';

/** The severity levels a {@link ConsoleLogger} understands, ordered least to most severe. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Ascending severity: an event is emitted only when its level is at or above the
// configured minimum, so a `debug` minimum lets everything through while an `info`
// minimum suppresses `debug`.
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * A {@link Logger} that writes structured events to the console, gated by a
 * minimum severity level.
 *
 * Levels below `minLevel` are dropped, so `debug` play-by-play stays opt-in
 * (default `info`) while `info`/`warn`/`error` surface at the default threshold.
 */
export class ConsoleLogger implements Logger {
  private readonly minLevel: number;

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = LEVEL_ORDER[minLevel];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldEmit('debug')) return;
    console.debug(message, context ?? {});
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldEmit('info')) return;
    console.info(message, context ?? {});
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldEmit('warn')) return;
    console.warn(message, context ?? {});
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldEmit('error')) return;
    console.error(message, context ?? {});
  }

  private shouldEmit(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= this.minLevel;
  }
}
