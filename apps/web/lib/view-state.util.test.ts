import { describe, expect, it } from 'vitest';
import { parseViewState, serializeViewState, type ViewState } from './view-state.util';

const TODAY = '2026-07-13';

function parse(query: string): ViewState {
  return parseViewState(new URLSearchParams(query), TODAY);
}

describe('view state URL round-trip', () => {
  it('round-trips a fully non-default state', () => {
    const state: ViewState = {
      date: '2026-07-20',
      holes: 18,
      players: 3,
      from: '08:00',
      courses: ['the-willows', 'the-legends'],
      group: true,
    };

    const roundTripped = parseViewState(
      new URLSearchParams(serializeViewState(state, TODAY)),
      TODAY
    );

    expect(roundTripped).toEqual(state);
  });

  it('omits every default from the serialized query', () => {
    const state: ViewState = {
      date: TODAY,
      holes: null,
      players: null,
      from: '05:00',
      courses: null,
      group: false,
    };

    expect(serializeViewState(state, TODAY)).toBe('');
  });

  it('falls back to defaults for unrecognized or out-of-range values', () => {
    const state = parse('date=not-a-date&players=9&holes=7&from=99:99');

    expect(state.date).toBe(TODAY);
    expect(state.players).toBeNull();
    expect(state.holes).toBeNull();
    expect(state.from).toBe('05:00');
  });

  it('treats an empty courses param as a deliberate empty selection', () => {
    expect(parse('courses=').courses).toEqual([]);
  });

  it('treats an absent courses param as all courses', () => {
    expect(parse('').courses).toBeNull();
  });

  it('drops empty course tokens while preserving valid slugs', () => {
    expect(parse('courses=the-willows,,the-legends').courses).toEqual([
      'the-willows',
      'the-legends',
    ]);
  });
});
