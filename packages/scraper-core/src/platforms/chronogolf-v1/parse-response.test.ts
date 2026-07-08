import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseResponse } from './parse-response.js';

const fixturesDir = new URL('./__fixtures__/', import.meta.url);
const fixtureFiles = readdirSync(fileURLToPath(fixturesDir)).filter((file) =>
  file.endsWith('.json')
);

function loadFixture(file: string): unknown {
  return JSON.parse(readFileSync(new URL(file, fixturesDir), 'utf-8'));
}

describe('parseResponse', () => {
  it.each(fixtureFiles)('parses the %s fixture into records', (file) => {
    const teeTimes = parseResponse(loadFixture(file));

    expect(teeTimes.length).toBeGreaterThan(0);
    for (const teeTime of teeTimes) {
      expect(typeof teeTime.id).toBe('number');
      expect(typeof teeTime.start_time).toBe('string');
      expect(Array.isArray(teeTime.restrictions)).toBe(true);
      expect(typeof teeTime.out_of_capacity).toBe('boolean');
    }
  });

  it('exposes the raw green fee on a bookable slot', () => {
    const teeTimes = parseResponse(loadFixture('greenbryre-2020-12h-2p.json'));

    const priced = teeTimes.find((teeTime) => (teeTime.green_fees?.length ?? 0) > 0);
    expect(priced?.green_fees?.[0]?.green_fee).toBeTypeOf('number');
  });

  it('rejects a response whose shape no longer matches', () => {
    expect(() => parseResponse([{ id: 'not-a-number' }])).toThrow();
  });
});
