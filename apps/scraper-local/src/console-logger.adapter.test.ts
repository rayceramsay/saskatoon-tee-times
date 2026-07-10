import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './console-logger.adapter.js';

describe('ConsoleLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses debug but emits info/warn/error at the default (info) level', () => {
    const logger = new ConsoleLogger();

    logger.debug('debug detail');
    logger.info('info event');
    logger.warn('warn event');
    logger.error('error event');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('info event', {});
    expect(console.warn).toHaveBeenCalledWith('warn event', {});
    expect(console.error).toHaveBeenCalledWith('error event', {});
  });

  it('emits debug when the minimum level is lowered to debug', () => {
    const logger = new ConsoleLogger('debug');

    logger.debug('debug detail', { unit: 'a' });

    expect(console.debug).toHaveBeenCalledWith('debug detail', { unit: 'a' });
  });

  it('suppresses levels below a raised minimum', () => {
    const logger = new ConsoleLogger('warn');

    logger.debug('debug detail');
    logger.info('info event');
    logger.warn('warn event');
    logger.error('error event');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('warn event', {});
    expect(console.error).toHaveBeenCalledWith('error event', {});
  });
});
