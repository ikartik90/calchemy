import { endOfCalendarWeek, startOfCalendarWeek } from "../primitives/date-math";
import { comparePlainDate, expandDatesBetween } from "../primitives/shared";
import { SamplerParityDayRemainderMap } from "../types";
import type { SamplerSlice } from "../slice";
import type { PlainDate } from "../../temporal/types";
import type { DateValue, WeekdayIndex } from "../../types";

// Example: `applySampler(monthRange, mondaySampler, 0)` returns matching Mondays in the month.
export function applySampler(
  value: DateValue,
  sampler: SamplerSlice,
  weekStartsOn: WeekdayIndex,
): DateValue | null {
  if (sampler.kind === "weeks") {
    return applyWeekSampler(value, sampler.interval, sampler.startIndex, weekStartsOn);
  }

  const dates = expandValueDates(value);
  if (dates.length === 0) {
    return null;
  }

  if (sampler.kind === "all-days") {
    return materializeSampledDates(selectEveryNthDate(dates, sampler.interval, sampler.startIndex));
  }

  if (sampler.kind === "day-number-parity") {
    const remainder = SamplerParityDayRemainderMap.get(sampler.parity);
    return {
      kind: "multiple",
      dates: dates.filter((date) => date.day % 2 === remainder),
    };
  }

  const matchingDates = dates.filter((date) => sampler.weekdays.includes(date.dayOfWeek));
  if (sampler.interval > 1 && sampler.weekdays.length > 1) {
    return materializeSampledDates(
      selectAlternateWeekdayDates(value, sampler.weekdays, sampler.interval, sampler.startIndex, weekStartsOn),
    );
  }

  return materializeSampledDates(
    selectEveryNthDate(matchingDates, sampler.interval, sampler.startIndex),
  );
}

// Example: `applyWeekSampler(quarterRange, 2, 0, 0)` returns every other week in the quarter.
function applyWeekSampler(
  value: DateValue,
  interval: number,
  startIndex: number,
  weekStartsOn: WeekdayIndex,
): DateValue | null {
  const scope = getRangeScope(value);
  if (!scope) {
    return null;
  }

  const dates: PlainDate[] = [];
  let weekStart = startOfCalendarWeek(scope.start, weekStartsOn);
  let weekIndex = 0;

  while (comparePlainDate(weekStart, scope.end) <= 0) {
    const weekEnd = endOfCalendarWeek(weekStart, weekStartsOn);
    if (weekIndex >= startIndex && (weekIndex - startIndex) % interval === 0) {
      const clipStart = comparePlainDate(weekStart, scope.start) < 0 ? scope.start : weekStart;
      const clipEnd = comparePlainDate(weekEnd, scope.end) > 0 ? scope.end : weekEnd;
      let cursor = clipStart;

      while (comparePlainDate(cursor, clipEnd) <= 0) {
        dates.push(cursor);
        cursor = cursor.add({ days: 1 });
      }
    }

    weekIndex += 1;
    weekStart = weekStart.add({ weeks: 1 });
  }

  return dates.length > 0 ? materializeSampledDates(dates) : null;
}

// Example: `expandValueDates(range)` expands every date in the inclusive range.
export function expandValueDates(value: DateValue): PlainDate[] {
  if (value.kind === "single") {
    return [value.date];
  }

  if (value.kind === "multiple") {
    return value.dates;
  }

  return expandDatesBetween(value.start, value.end);
}

// Example: `getRangeScope({ kind: "range", start, end })` returns inclusive bounds for week sampling.
function getRangeScope(value: DateValue): { start: PlainDate; end: PlainDate } | null {
  if (value.kind === "range") {
    return { start: value.start, end: value.end };
  }

  if (value.kind === "single") {
    return { start: value.date, end: value.date };
  }

  if (value.dates.length === 0) {
    return null;
  }

  const sorted = [...value.dates].sort(comparePlainDate);
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! };
}

// Example: `selectEveryNthDate(dates, 2, 0)` returns every other date.
function selectEveryNthDate(dates: readonly PlainDate[], interval: number, startIndex: number): PlainDate[] {
  return dates.filter((_, index) => index >= startIndex && (index - startIndex) % interval === 0);
}

// Example: `selectAlternateWeekdayDates(q4Range, [1, 3], 2, 0, 0)` returns Mon and Wed on alternate weeks in Q4.
function selectAlternateWeekdayDates(
  value: DateValue,
  weekdays: readonly number[],
  interval: number,
  startIndex: number,
  weekStartsOn: WeekdayIndex,
): PlainDate[] {
  const scope = getRangeScope(value);
  if (!scope) {
    return [];
  }

  const dates: PlainDate[] = [];
  let weekStart = startOfCalendarWeek(scope.start, weekStartsOn);
  let weekIndex = 0;

  while (comparePlainDate(weekStart, scope.end) <= 0) {
    if (weekIndex >= startIndex && (weekIndex - startIndex) % interval === 0) {
      const weekEnd = endOfCalendarWeek(weekStart, weekStartsOn);
      const clipStart = comparePlainDate(weekStart, scope.start) < 0 ? scope.start : weekStart;
      const clipEnd = comparePlainDate(weekEnd, scope.end) > 0 ? scope.end : weekEnd;
      let cursor = clipStart;

      while (comparePlainDate(cursor, clipEnd) <= 0) {
        if (weekdays.includes(cursor.dayOfWeek)) {
          dates.push(cursor);
        }
        cursor = cursor.add({ days: 1 });
      }
    }

    weekIndex += 1;
    weekStart = weekStart.add({ weeks: 1 });
  }

  return dates;
}

// Example: `materializeSampledDates([mon, tue, wed, thu, fri])` returns a contiguous weekday range.
export function materializeSampledDates(dates: readonly PlainDate[]): DateValue | null {
  if (dates.length === 0) {
    return null;
  }

  if (dates.length === 1) {
    return { kind: "single", date: dates[0]! };
  }

  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1];
    const current = dates[index];
    if (!previous || !current || comparePlainDate(current.subtract({ days: 1 }), previous) !== 0) {
      return { kind: "multiple", dates: [...dates] };
    }
  }

  return { kind: "range", start: dates[0]!, end: dates[dates.length - 1]! };
}

