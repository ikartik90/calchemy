import type { PlainDate } from "../../temporal/types";
import type { WeekdayIndex } from "../../types";

// Expands a two-digit year near the parser's current anchor year.
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

// Returns the last calendar day of the month after the anchor month.
export function endOfNextMonth(anchor: PlainDate): PlainDate {
  const firstOfNextMonth = anchor.with({ day: 1 }).add({ months: 1 });
  return firstOfNextMonth.add({ months: 1 }).subtract({ days: 1 });
}

// Returns the start of the week containing the date for the configured week start.
export function startOfWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  const temporalWeekday = toTemporalWeekday(weekStartsOn);
  let cursor = date;

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

// Returns the end of the week containing the date for the configured week start.
export function endOfWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  return startOfWeek(date, weekStartsOn).add({ days: 6 });
}

// Returns the first calendar day of the date's month.
export function startOfMonth(date: PlainDate): PlainDate {
  return date.with({ day: 1 });
}

// Returns the last calendar day of the date's month.
export function endOfMonth(date: PlainDate): PlainDate {
  return startOfMonth(date).add({ months: 1 }).subtract({ days: 1 });
}

// Returns the first calendar day of the date's year.
export function startOfYear(date: PlainDate): PlainDate {
  return date.with({ month: 1, day: 1 });
}

// Returns the last calendar day of the date's year.
export function endOfYear(date: PlainDate): PlainDate {
  return startOfYear(date).add({ years: 1 }).subtract({ days: 1 });
}

// Finds the first matching weekday on or after the given date.
export function firstWeekdayOnOrAfter(date: PlainDate, weekday: number): PlainDate {
  let cursor = date;

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.add({ days: 1 });
  }

  return cursor;
}

// Finds the first matching weekday strictly after the given date.
export function firstWeekdayAfter(date: PlainDate, weekday: number): PlainDate {
  let cursor = date.add({ days: 1 });

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.add({ days: 1 });
  }

  return cursor;
}

// Finds the first matching weekday strictly before the given date.
export function firstWeekdayBefore(date: PlainDate, weekday: number): PlainDate {
  let cursor = date.subtract({ days: 1 });

  while (cursor.dayOfWeek !== weekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

// Finds the next configured week start after the anchor date.
export function startOfNextWeek(anchor: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  const temporalWeekday = toTemporalWeekday(weekStartsOn);
  let cursor = anchor.add({ days: 1 });

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.add({ days: 1 });
  }

  return cursor;
}

// Converts public week-start numbering into Temporal weekday numbering.
function toTemporalWeekday(weekStartsOn: WeekdayIndex): number {
  return weekStartsOn === 0 ? 7 : weekStartsOn;
}
