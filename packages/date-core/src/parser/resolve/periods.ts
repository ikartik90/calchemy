import { comparePlainDate, expandDatesBetween } from "../primitives/shared";
import type { EachUnitPeriod } from "../slice/types";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type {
  BoundaryPlacement,
  CalendarListPeriod,
  DayGroupPeriod,
  DurationUnit,
} from "../types";
import type { DateValue, ResolvedParseDateContext, WeekdayIndex } from "../../types";

type DateRange = Extract<DateValue, { kind: "range" }>;

export function enumerateEachUnitPeriodRanges(
  within: DateRange,
  unit: EachUnitPeriod,
  weekStartsOn: WeekdayIndex,
  Temporal: TemporalApi,
): DateRange[] {
  switch (unit) {
    case "month":
      return enumerateMonthRanges(within, Temporal);
    case "week":
      return enumerateWeekRanges(within, weekStartsOn);
    case "quarter":
      return enumerateQuarterRanges(within, Temporal);
    case "year":
      return enumerateYearRanges(within, Temporal);
    default: {
      const unreachable: never = unit;
      return unreachable;
    }
  }
}

export function enumerateMonthRanges(
  within: DateRange,
  Temporal: TemporalApi,
): DateRange[] {
  const ranges: DateRange[] = [];
  let cursor = Temporal.PlainDate.from({
    year: within.start.year,
    month: within.start.month,
    day: 1,
  });

  while (comparePlainDate(cursor, within.end) <= 0) {
    const monthStart = cursor;
    const monthEnd = cursor.add({ months: 1 }).subtract({ days: 1 });
    if (
      comparePlainDate(monthEnd, within.start) >= 0 &&
      comparePlainDate(monthStart, within.end) <= 0
    ) {
      ranges.push({ kind: "range", start: monthStart, end: monthEnd });
    }

    cursor = monthStart.add({ months: 1 });
  }

  return ranges;
}

export function enumerateWeekRanges(
  within: DateRange,
  weekStartsOn: WeekdayIndex,
): DateRange[] {
  const ranges: DateRange[] = [];
  let weekStart = startOfCalendarWeek(within.start, weekStartsOn);

  while (comparePlainDate(weekStart, within.end) <= 0) {
    const weekEnd = endOfCalendarWeek(weekStart, weekStartsOn);
    if (
      comparePlainDate(weekEnd, within.start) >= 0 &&
      comparePlainDate(weekStart, within.end) <= 0
    ) {
      ranges.push({ kind: "range", start: weekStart, end: weekEnd });
    }

    weekStart = weekStart.add({ weeks: 1 });
  }

  return ranges;
}

export function enumerateQuarterRanges(
  within: DateRange,
  Temporal: TemporalApi,
): DateRange[] {
  const ranges: DateRange[] = [];
  let cursor = startOfQuarter(within.start, Temporal);

  while (comparePlainDate(cursor, within.end) <= 0) {
    const quarterStart = cursor;
    const quarterEnd = endOfQuarter(quarterStart, Temporal);
    if (
      comparePlainDate(quarterEnd, within.start) >= 0 &&
      comparePlainDate(quarterStart, within.end) <= 0
    ) {
      ranges.push({ kind: "range", start: quarterStart, end: quarterEnd });
    }

    cursor = quarterStart.add({ months: 3 });
  }

  return ranges;
}

export function enumerateYearRanges(
  within: DateRange,
  Temporal: TemporalApi,
): DateRange[] {
  const ranges: DateRange[] = [];

  for (let year = within.start.year; year <= within.end.year; year += 1) {
    const yearStart = Temporal.PlainDate.from({ year, month: 1, day: 1 });
    const yearEnd = Temporal.PlainDate.from({ year, month: 12, day: 31 });
    if (
      comparePlainDate(yearEnd, within.start) >= 0 &&
      comparePlainDate(yearStart, within.end) <= 0
    ) {
      ranges.push({ kind: "range", start: yearStart, end: yearEnd });
    }
  }

  return ranges;
}

export function clipRangeToWindow(
  range: DateRange,
  windowStart: PlainDate,
  windowEnd: PlainDate,
): DateRange | null {
  const start = comparePlainDate(range.start, windowStart) < 0 ? windowStart : range.start;
  const end = comparePlainDate(range.end, windowEnd) > 0 ? windowEnd : range.end;
  return comparePlainDate(start, end) <= 0 ? { kind: "range", start, end } : null;
}

export function materializeSelectedRanges(
  ranges: readonly DateRange[],
): DateValue | null {
  if (ranges.length === 0) {
    return null;
  }

  if (areContiguousRanges(ranges)) {
    const firstRange = ranges[0];
    const lastRange = ranges.at(-1);
    return firstRange && lastRange
      ? { kind: "range", start: firstRange.start, end: lastRange.end }
      : null;
  }

  const dates = ranges.flatMap((selectedRange) =>
    expandDatesBetween(selectedRange.start, selectedRange.end),
  );
  return dates.length > 0 ? { kind: "multiple", dates } : null;
}

export function selectOrdinalCalendarUnitRange(
  range: DateRange,
  unit: CalendarListPeriod,
  ordinal: number,
  weekStartsOn: WeekdayIndex,
): DateValue | null {
  if (unit === "month") {
    const start = range.start.add({ months: ordinal - 1 });
    const end = start.add({ months: 1 }).subtract({ days: 1 });
    if (comparePlainDate(start, range.end) > 0) {
      return null;
    }

    return {
      kind: "range",
      start,
      end: comparePlainDate(end, range.end) <= 0 ? end : range.end,
    };
  }

  let weekStart = startOfCalendarWeek(range.start, weekStartsOn);
  let weekIndex = 0;

  while (comparePlainDate(weekStart, range.end) <= 0) {
    if (weekIndex === ordinal - 1) {
      const weekEnd = endOfCalendarWeek(weekStart, weekStartsOn);
      const start = comparePlainDate(weekStart, range.start) < 0 ? range.start : weekStart;
      const end = comparePlainDate(weekEnd, range.end) > 0 ? range.end : weekEnd;
      if (comparePlainDate(start, range.end) > 0) {
        return null;
      }

      return { kind: "range", start, end };
    }

    weekIndex += 1;
    weekStart = weekStart.add({ weeks: 1 });
  }

  return null;
}

export function selectEdgeCountUnits(
  range: DateRange,
  edge: BoundaryPlacement,
  count: number,
  unit: DurationUnit,
  weekStartsOn: WeekdayIndex,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  skipHolidays = false,
): DateValue | null {
  if (unit === "day") {
    const date = edge === "first" ? range.start : range.end;
    if (count === 1) {
      return skipHolidays && context.holidays?.includes(date)
        ? { kind: "multiple", dates: [] }
        : { kind: "single", date };
    }

    const value =
      edge === "first"
        ? {
            kind: "range" as const,
            start: range.start,
            end: range.start.add({ days: count - 1 }),
          }
        : {
            kind: "range" as const,
            start: range.end.subtract({ days: count - 1 }),
            end: range.end,
          };

    if (
      comparePlainDate(value.start, range.start) < 0 ||
      comparePlainDate(value.end, range.end) > 0
    ) {
      return null;
    }

    if (!skipHolidays || !context.holidays) {
      return value;
    }

    const dates = expandDatesBetween(value.start, value.end).filter(
      (candidate) => !context.holidays?.includes(candidate),
    );
    return dates.length > 0 ? { kind: "multiple", dates } : { kind: "multiple", dates: [] };
  }

  if (unit === "weekdays" || unit === "weekend") {
    return selectEdgeCountDayGroupDates(range, edge, count, unit);
  }

  const periods = enumeratePeriodsByUnit(range, unit, weekStartsOn, Temporal);
  const selected = edge === "first" ? periods.slice(0, count) : periods.slice(-count);
  const materialized = materializeSelectedRanges(selected);
  if (materialized?.kind !== "range") {
    return materialized;
  }

  return clipRangeToWindow(materialized, range.start, range.end);
}

function selectEdgeCountDayGroupDates(
  range: DateRange,
  edge: BoundaryPlacement,
  count: number,
  group: DayGroupPeriod,
): DateValue | null {
  const weekdays = group === "weekend" ? [6, 7] : [1, 2, 3, 4, 5];
  const matchingDates = expandDatesBetween(range.start, range.end).filter((date) =>
    weekdays.includes(date.dayOfWeek),
  );
  if (matchingDates.length === 0) {
    return null;
  }

  const selected =
    edge === "first" ? matchingDates.slice(0, count) : matchingDates.slice(-count);
  if (selected.length === 0) {
    return null;
  }

  if (selected.length === 1) {
    return { kind: "single", date: selected[0] as PlainDate };
  }

  if (areContiguousDates(selected)) {
    return {
      kind: "range",
      start: selected[0] as PlainDate,
      end: selected[selected.length - 1] as PlainDate,
    };
  }

  return { kind: "multiple", dates: selected };
}

function areContiguousDates(dates: readonly PlainDate[]): boolean {
  return dates.every((date, index) => {
    const previous = dates[index - 1];
    return !previous || date.equals(previous.add({ days: 1 }));
  });
}

function enumeratePeriodsByUnit(
  range: DateRange,
  unit: DurationUnit,
  weekStartsOn: WeekdayIndex,
  Temporal: TemporalApi,
): DateRange[] {
  switch (unit) {
    case "week":
      return enumerateWeekRanges(range, weekStartsOn);
    case "month":
      return enumerateMonthRanges(range, Temporal);
    case "quarter":
      return enumerateQuarterRanges(range, Temporal);
    case "year":
      return enumerateYearRanges(range, Temporal);
    default:
      return [];
  }
}

export function startOfCalendarWeek(
  date: PlainDate,
  weekStartsOn: WeekdayIndex,
): PlainDate {
  const temporalWeekday = weekStartsOn === 0 ? 7 : weekStartsOn;
  let cursor = date;

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

export function endOfCalendarWeek(
  date: PlainDate,
  weekStartsOn: WeekdayIndex,
): PlainDate {
  return startOfCalendarWeek(date, weekStartsOn).add({ days: 6 });
}

export function startOfQuarter(date: PlainDate, Temporal: TemporalApi): PlainDate {
  const quarterMonth = Math.floor((date.month - 1) / 3) * 3 + 1;
  return Temporal.PlainDate.from({ year: date.year, month: quarterMonth, day: 1 });
}

export function endOfQuarter(date: PlainDate, Temporal: TemporalApi): PlainDate {
  return startOfQuarter(date, Temporal).add({ months: 3 }).subtract({ days: 1 });
}

function areContiguousRanges(ranges: readonly DateRange[]): boolean {
  return ranges.every((range, index) => {
    const previousRange = ranges[index - 1];
    return !previousRange || range.start.equals(previousRange.end.add({ days: 1 }));
  });
}
