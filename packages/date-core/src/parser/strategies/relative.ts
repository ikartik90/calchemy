import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  firstWeekdayAfter,
  firstWeekdayBefore,
  firstWeekdayOnOrAfter,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "./date-math";
import { comparePlainDate, parseAmount, toDuration } from "./shared";
import type { PlainDate } from "../../temporal/types";
import type { DateValue, DurationUnit, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

const RELATIVE_MODIFIERS = ["this", "next", "upcoming", "future", "last", "previous", "past"] as const;

type RelativeModifier = (typeof RELATIVE_MODIFIERS)[number];
type CalendarUnit = DurationUnit;
type DayGroup = "weekdays" | "weekend";

// Parses relative date phrases such as "today", "next week", or "past 10 days".
export function parseRelativeExpression(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const rangeSubset = parseLeadingOrTrailingDaysOfRange(input, anchorDate, context, lookups);
  if (rangeSubset) {
    return rangeSubset;
  }

  const relativeMatch = /^(\w+|\d+) ([a-z]+) from now$/.exec(input);
  if (relativeMatch) {
    const amount = parseAmount(relativeMatch[1]);
    const unit = lookups.durationUnits.get(relativeMatch[2] ?? "");
    if (amount && unit) {
      return { kind: "single", date: anchorDate.add(toDuration(amount, unit)) };
    }
  }

  const lastDaysMatch = /^last (\d+) days$/.exec(input);
  if (lastDaysMatch?.[1]) {
    const days = Number(lastDaysMatch[1]);
    const end = anchorDate;
    const offset = context.lastNDaysIncludesToday ? Math.max(days - 1, 0) : days;
    return { kind: "range", start: end.subtract({ days: offset }), end };
  }

  return parseRelativeModifierExpression(input, anchorDate, context, lookups);
}

// Parses subranges such as "last 20 days of next month" or "first ten days of next quarter".
function parseLeadingOrTrailingDaysOfRange(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const skipHolidays = /\s+(?:excluding|skip) holidays$/.test(input);
  const rangeInput = skipHolidays ? input.replace(/\s+(?:excluding|skip) holidays$/, "") : input;
  const singularMatch = /^(first|last) day (?:of|in) (?:the )?(.+)$/.exec(rangeInput);
  if (singularMatch?.[1] && singularMatch[2]) {
    const range = parseRelativeModifierExpression(singularMatch[2], anchorDate, context, lookups);
    if (range?.kind !== "range") {
      return null;
    }

    const date = singularMatch[1] === "first" ? range.start : range.end;
    return skipHolidays && context.holidays?.includes(date) ? { kind: "multiple", dates: [] } : { kind: "single", date };
  }

  const match = /^(first|last) (.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(rangeInput);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    return null;
  }

  const count = parseAmount(match[2]);
  const unit = lookups.durationUnits.get(match[3]);
  const range = parseRelativeModifierExpression(match[4], anchorDate, context, lookups);
  if (!count || count < 1 || unit !== "day" || range?.kind !== "range") {
    return null;
  }

  if (match[1] === "first") {
    const end = range.start.add({ days: count - 1 });
    return comparePlainDate(end, range.end) <= 0 ? applyHolidayExclusion({ kind: "range", start: range.start, end }, skipHolidays, context) : null;
  }

  const start = range.end.subtract({ days: count - 1 });
  return comparePlainDate(range.start, start) <= 0
    ? applyHolidayExclusion({ kind: "range", start, end: range.end }, skipHolidays, context)
    : null;
}

// Converts a range into discrete dates when the phrase excludes configured holidays.
function applyHolidayExclusion(
  value: Extract<DateValue, { kind: "range" }>,
  skipHolidays: boolean,
  context: ResolvedParseDateContext,
): DateValue {
  if (!skipHolidays) {
    return value;
  }

  return { kind: "multiple", dates: expandDatesBetween(value.start, value.end).filter((date) => !context.holidays?.includes(date)) };
}

// Expands every calendar date in an inclusive range.
function expandDatesBetween(start: PlainDate, end: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;

  while (comparePlainDate(cursor, end) <= 0) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
  }

  return dates;
}

// Parses modifier-based relative phrases such as "next friday" or "previous month".
export function parseRelativeModifierExpression(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const match = /^([a-z]+) (.+)$/.exec(input);
  const modifier = parseRelativeModifier(match?.[1]);

  if (!modifier || !match?.[2]) {
    return null;
  }

  const target = match[2];
  const durationTarget = parseCountedDurationTarget(target, lookups);
  if (durationTarget && modifier !== "this") {
    return resolveDurationRange(modifier, durationTarget.count, durationTarget.unit, anchorDate, context);
  }

  const countedWeekdayTarget = parseCountedWeekdayTarget(target, lookups);
  if (countedWeekdayTarget && modifier !== "this") {
    return {
      kind: "multiple",
      dates: resolveCountedWeekdays(modifier, countedWeekdayTarget.count, countedWeekdayTarget.weekday, anchorDate),
    };
  }

  const dayGroup = parseDayGroup(target);
  if (dayGroup) {
    return resolveDayGroupRange(modifier, dayGroup, anchorDate, context);
  }

  const weekday = lookups.weekdays.get(target);
  if (weekday) {
    return { kind: "single", date: resolveRelativeWeekday(modifier, weekday, anchorDate) };
  }

  const calendarUnit = parseCalendarUnit(target, lookups);
  if (calendarUnit) {
    return resolveCalendarUnitRange(modifier, calendarUnit, anchorDate, context);
  }

  return null;
}

// Identifies supported relative modifier words.
function parseRelativeModifier(value: string | undefined): RelativeModifier | null {
  if (!value) {
    return null;
  }

  return RELATIVE_MODIFIERS.includes(value as RelativeModifier) ? (value as RelativeModifier) : null;
}

// Parses duration targets such as "3 weeks" from a relative modifier phrase.
function parseCountedDurationTarget(
  target: string,
  lookups: DateVocabularyLookups,
): { count: number; unit: DurationUnit } | null {
  return parseCountedMappedTarget(target, (value, count) => {
    const unit = lookups.durationUnits.get(value);
    return unit ? { count, unit } : null;
  });
}

// Parses counted weekday targets such as "3 fridays" from a relative modifier phrase.
function parseCountedWeekdayTarget(
  target: string,
  lookups: DateVocabularyLookups,
): { count: number; weekday: number } | null {
  return parseCountedMappedTarget(target, (value, count) => {
    const weekday = lookups.weekdays.get(value);
    return weekday ? { count, weekday } : null;
  });
}

// Maps a parsed counted target into a duration or weekday-specific result.
function parseCountedMappedTarget<T>(target: string, mapTarget: (target: string, count: number) => T | null): T | null {
  const parsed = parseCountedTarget(target);
  return parsed ? mapTarget(parsed.target, parsed.count) : null;
}

// Parses shared counted target syntax such as "3 weeks" or "2 fridays".
function parseCountedTarget(target: string): { count: number; target: string } | null {
  const match = /^(.+) ([a-z]+)$/.exec(target);
  const amount = match?.[1];
  const targetValue = match?.[2];
  const count = amount ? parseAmount(amount) : null;
  if (!targetValue || !count || count < 1) {
    return null;
  }

  return { count, target: targetValue };
}

// Parses a calendar unit target such as "week", "month", or "year".
function parseCalendarUnit(target: string, lookups: DateVocabularyLookups): CalendarUnit | null {
  const unit = lookups.durationUnits.get(target);
  return unit ?? null;
}

// Parses grouped day targets such as "weekend" or "weekdays".
function parseDayGroup(target: string): DayGroup | null {
  if (target === "weekday" || target === "weekdays") {
    return "weekdays";
  }

  if (target === "weekend" || target === "weekends") {
    return "weekend";
  }

  return null;
}

// Resolves a relative weekday phrase into one concrete date.
function resolveRelativeWeekday(modifier: RelativeModifier, weekday: number, anchorDate: PlainDate): PlainDate {
  if (modifier === "this" || modifier === "upcoming" || modifier === "future") {
    return firstWeekdayOnOrAfter(anchorDate, weekday);
  }

  if (modifier === "next") {
    return firstWeekdayAfter(firstWeekdayOnOrAfter(anchorDate, weekday), weekday);
  }

  return firstWeekdayBefore(anchorDate, weekday);
}

// Resolves counted weekday phrases into multiple dates.
function resolveCountedWeekdays(
  modifier: RelativeModifier,
  count: number,
  weekday: number,
  anchorDate: PlainDate,
): PlainDate[] {
  const dates: PlainDate[] = [];
  const isBackward = isBackwardModifier(modifier);
  let cursor = isBackward
    ? firstWeekdayBefore(modifier === "past" ? anchorDate.add({ days: 1 }) : anchorDate, weekday)
    : firstWeekdayOnOrAfter(anchorDate, weekday);

  while (dates.length < count) {
    dates.push(cursor);
    cursor = isBackward ? cursor.subtract({ days: 7 }) : cursor.add({ days: 7 });
  }

  return dates;
}

// Resolves weekday/weekend phrases into their calendar date ranges.
function resolveDayGroupRange(
  modifier: RelativeModifier,
  group: DayGroup,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
): DateValue {
  const offset = modifier === "next" ? 1 : isBackwardModifier(modifier) ? -1 : 0;
  const weekStart = startOfWeek(anchorDate.add({ weeks: offset }), context.weekStartsOn);
  const start = group === "weekdays" ? firstWeekdayOnOrAfter(weekStart, 1) : firstWeekdayOnOrAfter(weekStart, 6);
  const end = group === "weekdays" ? firstWeekdayOnOrAfter(start, 5) : firstWeekdayOnOrAfter(start, 7);

  return { kind: "range", start, end };
}

// Resolves counted duration phrases into a date range.
function resolveDurationRange(
  modifier: RelativeModifier,
  count: number,
  unit: DurationUnit,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
): DateValue | null {
  if (isBackwardModifier(modifier)) {
    const end = anchorDate;
    if (unit === "day") {
      const offset = context.lastNDaysIncludesToday ? Math.max(count - 1, 0) : count;
      return { kind: "range", start: end.subtract({ days: offset }), end };
    }

    const start = context.lastNDaysIncludesToday
      ? end.subtract(toDuration(count, unit)).add({ days: 1 })
      : end.subtract(toDuration(count, unit));
    return { kind: "range", start, end };
  }

  if (isForwardModifier(modifier)) {
    const start = anchorDate;
    const end =
      unit === "day" ? start.add({ days: Math.max(count - 1, 0) }) : start.add(toDuration(count, unit)).subtract({ days: 1 });
    return { kind: "range", start, end };
  }

  return null;
}

// Resolves calendar-unit phrases into their full date range.
function resolveCalendarUnitRange(
  modifier: RelativeModifier,
  unit: CalendarUnit,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
): DateValue | null {
  const offset = modifier === "this" ? 0 : isForwardModifier(modifier) ? 1 : -1;
  const date = anchorDate.add(toDuration(offset, unit));

  if (unit === "day") {
    return { kind: "single", date };
  }

  if (unit === "week") {
    return { kind: "range", start: startOfWeek(date, context.weekStartsOn), end: endOfWeek(date, context.weekStartsOn) };
  }

  if (unit === "month") {
    return { kind: "range", start: startOfMonth(date), end: endOfMonth(date) };
  }

  if (unit === "year") {
    return { kind: "range", start: startOfYear(date), end: endOfYear(date) };
  }

  return null;
}

// Returns whether a modifier points backward from the anchor date.
function isBackwardModifier(modifier: RelativeModifier): boolean {
  return modifier === "last" || modifier === "previous" || modifier === "past";
}

// Returns whether a modifier points forward from the anchor date.
function isForwardModifier(modifier: RelativeModifier): boolean {
  return modifier === "next" || modifier === "upcoming" || modifier === "future";
}
