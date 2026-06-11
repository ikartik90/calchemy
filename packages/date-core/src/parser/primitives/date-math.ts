import type { PlainDate } from "../../temporal/types";
import type { WeekdayIndex } from "../../types";

// Example: `expandTwoDigitYear(27, 2026)` returns `2027`.
export function expandTwoDigitYear(year: number, anchorYear: number): number {
  if (year >= 100) {
    return year;
  }

  const century = Math.floor(anchorYear / 100) * 100;
  const expanded = century + year;

  if (expanded < anchorYear - 50) {
    return expanded + 100;
  }

  if (expanded > anchorYear + 50) {
    return expanded - 100;
  }

  return expanded;
}

// Example: `firstWeekdayOnOrAfter(date, 1)` returns the next Monday including `date`.
export function firstWeekdayOnOrAfter(date: PlainDate, weekday: number): PlainDate {
  let cursor = date;

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.add({ days: 1 });
  }

  return cursor;
}

// Example: `firstWeekdayAfter(date, 5)` returns the first Friday after `date`.
export function firstWeekdayAfter(date: PlainDate, weekday: number): PlainDate {
  let cursor = date.add({ days: 1 });

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.add({ days: 1 });
  }

  return cursor;
}

// Example: `firstWeekdayBefore(date, 4)` returns the first Thursday before `date`.
export function firstWeekdayBefore(date: PlainDate, weekday: number): PlainDate {
  let cursor = date.subtract({ days: 1 });

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

// Example: `startOfCalendarWeek(date, 0)` returns the Sunday starting that week.
export function startOfCalendarWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  const temporalWeekday = weekStartsOn === 0 ? 7 : weekStartsOn;
  let cursor = date;

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

// Example: `endOfCalendarWeek(date, 0)` returns the Saturday ending that week.
export function endOfCalendarWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  return startOfCalendarWeek(date, weekStartsOn).add({ days: 6 });
}

