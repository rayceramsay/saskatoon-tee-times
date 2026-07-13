import { describe, expect, it } from 'vitest';
import { applyView } from './apply-view.util';
import { makeTeeTime } from './test-support/make-tee-time';
import type { ViewState } from './view-state.util';

// 07:00 course-local (America/Regina, −06:00 year-round).
const NOW = new Date('2026-07-13T13:00:00Z');

const defaultViewState: ViewState = {
  date: '2026-07-13',
  holes: null,
  players: null,
  from: '05:00',
  courses: null,
  group: false,
};

function viewState(overrides: Partial<ViewState> = {}): ViewState {
  return { ...defaultViewState, ...overrides };
}

describe('applyView', () => {
  it('hides tee times whose start has already passed', () => {
    const past = makeTeeTime({ startInstant: '2026-07-13T06:30:00-06:00' });
    const future = makeTeeTime({ startInstant: '2026-07-13T08:00:00-06:00' });

    const result = applyView([past, future], viewState(), NOW);

    expect(result.teeTimes).toEqual([future]);
  });

  it('keeps only selected courses', () => {
    const willows = makeTeeTime({ courseId: 'the-willows', courseName: 'The Willows' });
    const legends = makeTeeTime({
      courseId: 'the-legends',
      courseName: 'The Legends',
      startInstant: '2026-07-13T09:00:00-06:00',
    });

    const result = applyView(
      [willows, legends],
      viewState({ courses: ['the-willows'] }),
      NOW
    );

    expect(result.teeTimes.map((t) => t.courseId)).toEqual(['the-willows']);
  });

  it('matches holes by equality', () => {
    const nine = makeTeeTime({ holes: 9 });
    const eighteen = makeTeeTime({
      holes: 18,
      startInstant: '2026-07-13T09:00:00-06:00',
    });

    const result = applyView([nine, eighteen], viewState({ holes: 18 }), NOW);

    expect(result.teeTimes.map((t) => t.holes)).toEqual([18]);
  });

  it('filters players by non-contiguous group-size membership', () => {
    const noSingles = makeTeeTime({ groupSizes: [2, 3, 4] });

    const result = applyView([noSingles], viewState({ players: 1 }), NOW);

    expect(result.teeTimes).toEqual([]);
  });

  it('hides slots starting before the earliest-start floor', () => {
    const early = makeTeeTime({ startInstant: '2026-07-13T07:30:00-06:00' });
    const later = makeTeeTime({ startInstant: '2026-07-13T08:30:00-06:00' });

    const result = applyView([early, later], viewState({ from: '08:00' }), NOW);

    expect(result.teeTimes).toEqual([later]);
  });

  it('sorts results chronologically ascending', () => {
    const nine = makeTeeTime({ startInstant: '2026-07-13T09:00:00-06:00' });
    const eight = makeTeeTime({ startInstant: '2026-07-13T08:00:00-06:00' });
    const ten = makeTeeTime({ startInstant: '2026-07-13T10:00:00-06:00' });

    const result = applyView([nine, ten, eight], viewState(), NOW);

    expect(result.teeTimes.map((t) => t.startInstant)).toEqual([
      '2026-07-13T08:00:00-06:00',
      '2026-07-13T09:00:00-06:00',
      '2026-07-13T10:00:00-06:00',
    ]);
  });

  it('groups by course chronologically and omits empty course groups', () => {
    const willowsEarly = makeTeeTime({
      courseId: 'the-willows',
      courseName: 'The Willows',
      startInstant: '2026-07-13T08:00:00-06:00',
    });
    const legends = makeTeeTime({
      courseId: 'the-legends',
      courseName: 'The Legends',
      holes: 9,
      startInstant: '2026-07-13T08:30:00-06:00',
    });
    const willowsLate = makeTeeTime({
      courseId: 'the-willows',
      courseName: 'The Willows',
      startInstant: '2026-07-13T09:30:00-06:00',
    });

    const result = applyView(
      [willowsLate, legends, willowsEarly],
      viewState({ group: true, holes: 18 }),
      NOW
    );

    expect(result.groups).not.toBeNull();
    expect(result.groups!.map((g) => g.id)).toEqual(['the-willows']);
    expect(result.groups![0]!.teeTimes.map((t) => t.startInstant)).toEqual([
      '2026-07-13T08:00:00-06:00',
      '2026-07-13T09:30:00-06:00',
    ]);
  });
});
