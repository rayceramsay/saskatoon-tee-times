'use client';

import { useEffect, useRef, useState } from 'react';
import type { CourseOption } from '../lib/derived.util';
import { resolveSelectedCourseIds } from '../lib/derived.util';
import {
  earliestStartLabel,
  formatDateChip,
  formatMonthYear,
} from '../lib/format.util';
import {
  furthestNavigableDate,
  isNavigable,
  shiftDate,
} from '../lib/navigable-dates.util';
import {
  EARLIEST_START_STOPS,
  HOLES_OPTIONS,
  PLAYERS_OPTIONS,
  type ViewState,
} from '../lib/view-state.util';

const SECTION_LABEL = 'mb-2 block text-label-caps uppercase text-ink-3';
const ARROW =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-2 disabled:opacity-40 disabled:cursor-default';

/** Callbacks and state every filter control shares. */
export interface FilterControlsProps {
  viewState: ViewState;
  courses: CourseOption[];
  today: string;
  /** Date changes push a history entry (Back returns to the prior day). */
  onDateChange: (date: string) => void;
  /** Non-date filter changes replace history in place. */
  onFilterChange: (patch: Partial<ViewState>) => void;
}

interface ToggleGroupProps {
  ariaLabel: string;
  options: { label: string; value: number | null }[];
  value: number | null;
  onChange: (value: number | null) => void;
}

function ToggleGroup({ ariaLabel, options, value, onChange }: ToggleGroupProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md border py-1.5 text-center text-xs font-medium whitespace-nowrap ${
              active
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-panel text-ink-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const HOLES_TOGGLES = [
  { label: 'Any', value: null },
  ...HOLES_OPTIONS.map((h) => ({ label: String(h), value: h })),
];
const PLAYERS_TOGGLES = [
  { label: 'Any', value: null },
  ...PLAYERS_OPTIONS.map((p) => ({ label: String(p), value: p })),
];

/** Holes filter: `Any | 6 | 9 | 12 | 18`. */
export function HolesFilter({ viewState, onFilterChange }: FilterControlsProps) {
  return (
    <div>
      <span className={SECTION_LABEL}>Holes</span>
      <ToggleGroup
        ariaLabel="Holes filter"
        options={HOLES_TOGGLES}
        value={viewState.holes}
        onChange={(holes) => onFilterChange({ holes })}
      />
    </div>
  );
}

/** Players filter: `Any | 1 | 2 | 3 | 4`. */
export function PlayersFilter({ viewState, onFilterChange }: FilterControlsProps) {
  return (
    <div>
      <span className={SECTION_LABEL}>Players</span>
      <ToggleGroup
        ariaLabel="Players filter"
        options={PLAYERS_TOGGLES}
        value={viewState.players}
        onChange={(players) => onFilterChange({ players })}
      />
    </div>
  );
}

/** Static-catalog multi-select course filter with select/deselect-all. */
export function CourseFilter({
  viewState,
  courses,
  onFilterChange,
}: FilterControlsProps) {
  const allIds = courses.map((course) => course.id);
  const resolved = resolveSelectedCourseIds(viewState.courses, allIds);
  const checkedSet = resolved ?? new Set(allIds);
  const allChecked = resolved === null;

  const toggle = (id: string) => {
    const next = new Set(checkedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onFilterChange({ courses: next.size === allIds.length ? null : [...next] });
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-label-caps text-ink-3 uppercase">Course</span>
        <button
          type="button"
          onClick={() => onFilterChange({ courses: allChecked ? [] : null })}
          className="text-ink-3 text-[11px] underline underline-offset-2"
        >
          {allChecked ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {courses.map((course) => (
          <label
            key={course.id}
            className="text-ink-2 flex cursor-pointer items-start gap-2 text-xs leading-snug"
          >
            <input
              type="checkbox"
              checked={resolved === null || resolved.has(course.id)}
              onChange={() => toggle(course.id)}
              className="accent-accent mt-px h-3.5 w-3.5 shrink-0"
            />
            <span>{course.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Earliest-start slider across hourly stops from the floor to the ceiling. */
export function EarliestStartControl({
  viewState,
  onFilterChange,
}: FilterControlsProps) {
  const index = Math.max(0, EARLIEST_START_STOPS.indexOf(viewState.from));
  return (
    <div>
      <span className={SECTION_LABEL}>Earliest start</span>
      <div className="text-ink mb-2 text-[13px] font-semibold">
        {earliestStartLabel(viewState.from)}
      </div>
      <input
        type="range"
        min={0}
        max={EARLIEST_START_STOPS.length - 1}
        step={1}
        value={index}
        aria-label="Earliest start"
        onChange={(event) =>
          onFilterChange({ from: EARLIEST_START_STOPS[Number(event.target.value)] })
        }
        className="accent-accent w-full"
      />
      <div className="text-ink-3 mt-1.5 flex justify-between text-[10px]">
        <span>5 AM</span>
        <span>9 PM</span>
      </div>
    </div>
  );
}

/** Group-by-course switch. */
export function GroupByCourseSwitch({
  viewState,
  onFilterChange,
}: FilterControlsProps) {
  const on = viewState.group;
  return (
    <div className="text-ink-2 flex items-center justify-between text-[13px]">
      <span>Group by course</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Group by course"
        onClick={() => onFilterChange({ group: !on })}
        className={`relative h-[22px] w-[38px] rounded-full ${on ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22)] motion-safe:transition-all ${
            on ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

const DAY_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface CalendarProps {
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}

function Calendar({ selected, today, onSelect }: CalendarProps) {
  const [view, setView] = useState(() => {
    const [year, month] = selected.split('-').map(Number) as [number, number];
    return { year, monthIndex: month - 1 };
  });

  const firstDow = new Date(Date.UTC(view.year, view.monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(view.year, view.monthIndex + 1, 0)
  ).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const stepMonth = (delta: number) =>
    setView(({ year, monthIndex }) => {
      const next = new Date(Date.UTC(year, monthIndex + delta, 1));
      return { year: next.getUTCFullYear(), monthIndex: next.getUTCMonth() };
    });

  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="border-line text-ink-2 flex h-6 w-6 items-center justify-center rounded-sm border"
        >
          ‹
        </button>
        <span className="text-ink text-[13px] font-semibold">
          {formatMonthYear(view.year, view.monthIndex)}
        </span>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          aria-label="Next month"
          className="border-line text-ink-2 flex h-6 w-6 items-center justify-center rounded-sm border"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_OF_WEEK.map((day) => (
          <div
            key={day}
            className="text-ink-3 py-1 text-center text-[10px] font-semibold"
          >
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} />;
          const date = `${view.year}-${pad(view.monthIndex + 1)}-${pad(day)}`;
          const navigable = isNavigable(date, today);
          const isSelected = date === selected;
          return (
            <button
              key={date}
              type="button"
              disabled={!navigable}
              aria-disabled={!navigable}
              aria-current={date === today ? 'date' : undefined}
              onClick={() => navigable && onSelect(date)}
              className={`h-7 rounded-sm text-xs ${
                isSelected
                  ? 'bg-accent font-bold text-white'
                  : navigable
                    ? 'text-ink hover:bg-line-2'
                    : 'text-line cursor-default'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DateSectionProps extends FilterControlsProps {
  /** `popup` opens a floating calendar (desktop); `inline` always shows it (mobile sheet). */
  calendarMode: 'popup' | 'inline';
}

/** Date navigator: prev/next-day arrows plus a calendar (popup or inline). */
export function DateSection({
  viewState,
  today,
  onDateChange,
  calendarMode,
}: DateSectionProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const prevDisabled = viewState.date <= today;
  const nextDisabled = viewState.date >= furthestNavigableDate(today);

  return (
    <div className="relative" ref={containerRef}>
      <span className={SECTION_LABEL}>Date</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={ARROW}
          disabled={prevDisabled}
          onClick={() => onDateChange(shiftDate(viewState.date, -1))}
          aria-label="Previous day"
        >
          ‹
        </button>
        {calendarMode === 'popup' ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="text-ink hover:bg-line-2 flex-1 rounded-md px-1.5 py-1 text-center text-[14px] font-semibold"
          >
            {formatDateChip(viewState.date)}
          </button>
        ) : (
          <span className="text-ink flex-1 text-center text-[15px] font-semibold">
            {formatDateChip(viewState.date)}
          </span>
        )}
        <button
          type="button"
          className={ARROW}
          disabled={nextDisabled}
          onClick={() => onDateChange(shiftDate(viewState.date, 1))}
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {calendarMode === 'inline' && (
        <div className="mt-2.5">
          <Calendar selected={viewState.date} today={today} onSelect={onDateChange} />
        </div>
      )}

      {calendarMode === 'popup' && open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="border-line bg-panel absolute top-full left-0 z-50 mt-1 w-[236px] rounded-lg border p-3 shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
        >
          <Calendar
            selected={viewState.date}
            today={today}
            onSelect={(date) => {
              onDateChange(date);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <hr className="border-line-2" />;
}

interface FilterSectionsProps extends FilterControlsProps {
  calendarMode: 'popup' | 'inline';
}

/** All filter controls, shared by the sidebar and the sheet. */
export function FilterSections({ calendarMode, ...props }: FilterSectionsProps) {
  return (
    <div className="flex flex-col gap-4">
      <DateSection {...props} calendarMode={calendarMode} />
      <Divider />
      <EarliestStartControl {...props} />
      <Divider />
      <CourseFilter {...props} />
      <Divider />
      <HolesFilter {...props} />
      <Divider />
      <PlayersFilter {...props} />
      <Divider />
      <GroupByCourseSwitch {...props} />
    </div>
  );
}
