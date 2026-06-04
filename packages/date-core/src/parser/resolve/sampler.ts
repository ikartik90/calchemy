import { comparePlainDate } from "../primitives/shared";
import { SamplerParityDayRemainderMap } from "../types";
import type { SamplerSlice } from "../slice";
import type { PlainDate } from "../../temporal/types";
import type { DateValue } from "../../types";

// Example: `applySampler(monthRange, mondaySampler)` returns matching Mondays in the month.
export function applySampler(value: DateValue, sampler: SamplerSlice): DateValue | null {
  const dates = expandValueDates(value);
  if (dates.length === 0) {
    return null;
  }

  if (sampler.kind === "all-days") {
    return { kind: "multiple", dates: selectEveryNthDate(dates, sampler.interval, sampler.startIndex) };
  }

  if (sampler.kind === "day-number-parity") {
    const remainder = SamplerParityDayRemainderMap.get(sampler.parity);
    return {
      kind: "multiple",
      dates: dates.filter((date) => date.day % 2 === remainder),
    };
  }

  return {
    kind: "multiple",
    dates: selectEveryNthDate(
      dates.filter((date) => sampler.weekdays.includes(date.dayOfWeek)),
      sampler.interval,
      sampler.startIndex,
    ),
  };
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

// Example: `selectEveryNthDate(dates, 2, 0)` returns every other date.
function selectEveryNthDate(dates: readonly PlainDate[], interval: number, startIndex: number): PlainDate[] {
  return dates.filter((_, index) => index >= startIndex && (index - startIndex) % interval === 0);
}

// Example: `expandDatesBetween(start, end)` returns all dates from start through end.
function expandDatesBetween(start: PlainDate, end: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;

  while (comparePlainDate(cursor, end) <= 0) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
