import { endOfMonth, firstWeekdayAfter, firstWeekdayBefore, firstWeekdayOnOrAfter, startOfMonth } from "../primitives/date-math";
import { parseDateAnchor, parseDateRangeAnchor } from "./anchors";
import { parseOrdinal } from "../primitives/ordinals";
import { parseQuarterRange } from "./quarter";
import { parseRelativeModifierExpression } from "./relative";
import { comparePlainDate, parseAmount, toDuration } from "../primitives/shared";
import { parseWeekRange } from "./week";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

const MONTH_RELATIVE_MODIFIERS = ["this", "next", "upcoming", "future", "last", "previous", "past"] as const;
type MonthRelativeModifier = (typeof MONTH_RELATIVE_MODIFIERS)[number];

// Parses weekday selections between two explicit date anchors.
export function parseWeekdaySelectionBetween(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^(?:select|all) (.+) between (.+) and (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const weekdays = parseWeekdayList(match[1], lookups);
  const start = parseDateAnchor(match[2], anchorDate, Temporal, lookups, context);
  const end = parseDateAnchor(match[3], anchorDate, Temporal, lookups, context);

  if (weekdays.length === 0 || !start || !end || comparePlainDate(start, end) > 0) {
    return null;
  }

  const dates: PlainDate[] = [];
  dates.push(...expandWeekdaysBetween(start, end, weekdays));

  return { kind: "multiple", dates };
}

// Parses weekday selections over a relative range such as "next 3 months".
export function parseWeekdaySelectionForRelativeRange(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^(?:(select|all|alternate|every other|every) )?(.+?) (?:for|during|in|from|of) (?:the )?(.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    if (!match?.[2] || !match[3]) {
      return null;
    }
  }

  const interval = match[1] === "alternate" || match[1] === "every other" ? 2 : 1;
  const dayUnit = lookups.durationUnits.get(match[2]);
  if (dayUnit === "day") {
    const value = parseRangeOrMultipleExpression(match[3], anchorDate, Temporal, context, lookups);
    const dates =
      value?.kind === "range" ? expandDatesBetween(value.start, value.end) : value?.kind === "multiple" ? value.dates : [];

    return dates.length > 0 ? { kind: "multiple", dates: selectEveryNthDate(dates, interval) } : null;
  }

  const weekdays = parseWeekdayList(match[2], lookups);
  const value = parseRangeOrMultipleExpression(match[3], anchorDate, Temporal, context, lookups);

  if (weekdays.length === 0) {
    return null;
  }

  if (value?.kind === "range") {
    return { kind: "multiple", dates: expandWeekdaysBetween(value.start, value.end, weekdays, interval) };
  }

  if (value?.kind === "multiple") {
    return {
      kind: "multiple",
      dates: selectEveryNthDate(
        value.dates.filter((date) => weekdays.includes(date.dayOfWeek)),
        interval,
      ),
    };
  }

  return null;
}

// Parses phrases such as "next monday in march plus two weeks".
export function parseWeekdayInMonthWithOffset(
  input: string,
  anchorDate: PlainDate,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const match = /^(this|next|upcoming|future|last|previous|past) ([a-z]+) in ([a-z]+)(?:\s*(plus|minus|-)\s*(.+) ([a-z]+))?$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const modifier = parseMonthRelativeModifier(match[1]);
  const weekday = lookups.weekdays.get(match[2]);
  const month = lookups.months.get(match[3]);
  if (!modifier || !weekday || !month) {
    return null;
  }

  const monthStart = startOfMonth(anchorDate.with({ year: resolveMonthYear(modifier, month, anchorDate), month }));
  const selectedDate = resolveWeekdayInMonth(modifier, weekday, monthStart);
  const offset = parseOptionalOffset(match[5], match[6], lookups);
  if (match[4] && !offset) {
    return null;
  }

  if (!offset) {
    return { kind: "single", date: selectedDate };
  }

  const isSubtraction = match[4] === "minus" || match[4] === "-";
  return { kind: "single", date: isSubtraction ? selectedDate.subtract(offset) : selectedDate.add(offset) };
}

// Parses phrases such as "tuesday following today plus three weeks".
export function parseWeekdayRelativeToAnchorWithOffset(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^(?:the )?([a-z]+) (following|after|before|preceding) (.+?)(?:\s*(plus|minus|-)\s*(.+) ([a-z]+))?$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const weekday = lookups.weekdays.get(match[1]);
  const anchor = parseWeekdayAnchor(match[3], match[2], anchorDate, Temporal, lookups, context);
  if (!weekday || !anchor) {
    return null;
  }

  const selectedDate =
    match[2] === "before" || match[2] === "preceding"
      ? firstWeekdayBefore(anchor, weekday)
      : firstWeekdayAfter(anchor, weekday);
  const offset = parseOptionalOffset(match[5], match[6], lookups);
  if (match[4] && !offset) {
    return null;
  }

  if (!offset) {
    return { kind: "single", date: selectedDate };
  }

  const isSubtraction = match[4] === "minus" || match[4] === "-";
  return { kind: "single", date: isSubtraction ? selectedDate.subtract(offset) : selectedDate.add(offset) };
}

// Resolves single-date or range anchors for weekday-before/after phrases.
function parseWeekdayAnchor(
  input: string,
  direction: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const singleAnchor = parseDateAnchor(input, anchorDate, Temporal, lookups, context);
  if (singleAnchor) {
    return singleAnchor;
  }

  const rangeAnchor = parseRangeExpression(input, anchorDate, Temporal, context, lookups);
  if (rangeAnchor?.kind !== "range") {
    return null;
  }

  return direction === "before" || direction === "preceding" ? rangeAnchor.start : rangeAnchor.end;
}

function parseRangeExpression(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const value = parseRangeOrMultipleExpression(input, anchorDate, Temporal, context, lookups);
  return value?.kind === "range" ? value : null;
}

function parseRangeOrMultipleExpression(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const relativeRange = parseRelativeModifierExpression(input, anchorDate, context, lookups);
  if (relativeRange?.kind === "range") {
    return relativeRange;
  }

  const quarterRange = parseQuarterRange(input, anchorDate, Temporal);
  if (quarterRange?.kind === "range") {
    return quarterRange;
  }

  const dateRangeAnchor = parseDateRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (dateRangeAnchor?.kind === "range" || dateRangeAnchor?.kind === "multiple") {
    return dateRangeAnchor;
  }

  return parseWeekRange(input, anchorDate, Temporal);
}

// Identifies supported month-relative modifier words.
function parseMonthRelativeModifier(value: string): MonthRelativeModifier | null {
  return MONTH_RELATIVE_MODIFIERS.includes(value as MonthRelativeModifier) ? (value as MonthRelativeModifier) : null;
}

// Resolves which calendar year contains the requested relative month.
function resolveMonthYear(modifier: MonthRelativeModifier, month: number, anchorDate: PlainDate): number {
  if (modifier === "next" || modifier === "upcoming" || modifier === "future") {
    return month > anchorDate.month ? anchorDate.year : anchorDate.year + 1;
  }

  if (modifier === "last" || modifier === "previous" || modifier === "past") {
    return month < anchorDate.month ? anchorDate.year : anchorDate.year - 1;
  }

  return anchorDate.year;
}

// Resolves the first or last matching weekday inside the month window.
function resolveWeekdayInMonth(
  modifier: MonthRelativeModifier,
  weekday: number,
  monthStart: PlainDate,
): PlainDate {
  if (modifier === "last" || modifier === "previous" || modifier === "past") {
    return firstWeekdayBefore(endOfMonth(monthStart).add({ days: 1 }), weekday);
  }

  return firstWeekdayOnOrAfter(monthStart, weekday);
}

// Parses an optional trailing duration offset after "plus" or "minus".
function parseOptionalOffset(
  amountInput: string | undefined,
  unitInput: string | undefined,
  lookups: DateVocabularyLookups,
): Record<string, number> | null {
  const amount = parseAmount(amountInput);
  const unit = unitInput ? lookups.durationUnits.get(unitInput) : undefined;
  return amount && unit ? toDuration(amount, unit) : null;
}

// Parses ordinal weekday selections relative to an anchor date.
export function parseOrdinalWeekdayRelativeToAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^(?:select )?(.+) ([a-z]+) (after|before) (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    return null;
  }

  const ordinal = parseOrdinal(match[1]);
  const weekday = lookups.weekdays.get(match[2]);
  const anchor = parseDateAnchor(match[4], anchorDate, Temporal, lookups, context);

  if (!ordinal || !weekday || !anchor) {
    return null;
  }

  let date = match[3] === "after" ? firstWeekdayAfter(anchor, weekday) : firstWeekdayBefore(anchor, weekday);
  for (let index = 1; index < ordinal; index += 1) {
    date = match[3] === "after" ? date.add({ days: 7 }) : date.subtract({ days: 7 });
  }

  return { kind: "single", date };
}

// Parses a natural-language weekday list into Temporal weekday numbers.
function parseWeekdayList(input: string, lookups: DateVocabularyLookups): number[] {
  const values = input
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const weekdays = values.map((value) => lookups.weekdays.get(value));

  if (weekdays.some((value) => value === undefined)) {
    return [];
  }

  return Array.from(new Set(weekdays as number[]));
}

// Selects every nth date from an already ordered set of dates.
function selectEveryNthDate(dates: readonly PlainDate[], interval: number): PlainDate[] {
  return dates.filter((_, index) => index % interval === 0);
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

// Expands matching weekdays between two dates, optionally skipping alternates.
function expandWeekdaysBetween(
  start: PlainDate,
  end: PlainDate,
  weekdays: readonly number[],
  interval = 1,
): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;
  let matchCount = 0;

  while (comparePlainDate(cursor, end) <= 0) {
    if (weekdays.includes(cursor.dayOfWeek)) {
      if (matchCount % interval === 0) {
        dates.push(cursor);
      }

      matchCount += 1;
    }

    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
