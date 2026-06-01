import { firstWeekdayOnOrAfter } from "./date-math";
import { parseNamedDate } from "./named-date";
import { parseNumericCandidates } from "./numeric";
import { parseOrdinal } from "./ordinal";
import { parseQuarterRange } from "./quarter";
import { parseRelativeModifierExpression } from "./relative";
import { comparePlainDate } from "./shared";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

type CalendarRangeUnit = "week" | "month" | "quarter" | "year";

// Resolves a phrase that can serve as a date anchor for other strategies.
export function parseDateAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const bareAnchor = parseBareDateAnchor(input, anchorDate, lookups);
  if (bareAnchor) {
    return bareAnchor;
  }

  const relativeModifier = parseRelativeModifierExpression(input, anchorDate, context, lookups);
  if (relativeModifier?.kind === "single") {
    return relativeModifier.date;
  }

  const uniqueWeekdayInRange = parseUniqueWeekdayInRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (uniqueWeekdayInRange) {
    return uniqueWeekdayInRange;
  }

  const ordinalWeekdayInRange = parseOrdinalWeekdayInRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (ordinalWeekdayInRange) {
    return ordinalWeekdayInRange;
  }

  const namedDate = parseNamedDate(input, anchorDate.year, Temporal, lookups, context);
  if (namedDate) {
    return namedDate;
  }

  const shiftedDateAnchor = parseShiftedDateAnchor(input, anchorDate, Temporal, lookups, context);
  if (shiftedDateAnchor) {
    return shiftedDateAnchor;
  }

  const numericCandidates = parseNumericCandidates(input, context, Temporal, {
    normalizedInput: input,
    tokens: [],
    corrections: [],
  });
  if (numericCandidates[0]?.value.kind === "single") {
    return numericCandidates[0].value.date;
  }

  return null;
}

// Resolves a phrase that can serve as a range anchor for before/after strategies.
export function parseDateRangeAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const ordinalCalendarUnitInRange = parseOrdinalCalendarUnitInRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (ordinalCalendarUnitInRange) {
    return ordinalCalendarUnitInRange;
  }

  const ordinalDayGroupInRange = parseOrdinalDayGroupInRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (ordinalDayGroupInRange) {
    return ordinalDayGroupInRange;
  }

  return null;
}

// Parses anchors such as "third week of last quarter" or "last quarter third week".
function parseOrdinalCalendarUnitInRangeAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const parts = parseOrdinalCalendarUnitInRangeParts(input, lookups);
  if (!parts) {
    return null;
  }

  const ordinal = parseOrdinal(parts.ordinalInput);
  const range = parseAnchorRange(parts.rangeInput, anchorDate, Temporal, context, lookups);
  if (!ordinal || range?.kind !== "range") {
    return null;
  }

  return selectOrdinalCalendarUnitRange(range, parts.unit, ordinal);
}

// Splits ordinal calendar-unit-in-range phrases into ordinal, unit, and range text.
function parseOrdinalCalendarUnitInRangeParts(
  input: string,
  lookups: DateVocabularyLookups,
): { ordinalInput: string; unit: "week" | "month"; rangeInput: string } | null {
  const parseUnit = (unitInput: string | undefined) => {
    const unit = unitInput ? lookups.durationUnits.get(unitInput) : undefined;
    return unit === "week" || unit === "month" ? unit : null;
  };

  const postfixMatch = /^(?:the )?(.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  const postfixUnit = parseUnit(postfixMatch?.[2]);
  if (postfixMatch?.[1] && postfixUnit && postfixMatch[3]) {
    return { ordinalInput: postfixMatch[1], unit: postfixUnit, rangeInput: postfixMatch[3] };
  }

  const barePostfixMatch = /^(?:the )?(.+) ([a-z]+) ((?:this|next|upcoming|future|last|previous|past) [a-z]+)$/.exec(input);
  const barePostfixUnit = parseUnit(barePostfixMatch?.[2]);
  if (barePostfixMatch?.[1] && barePostfixUnit && barePostfixMatch[3]) {
    return { ordinalInput: barePostfixMatch[1], unit: barePostfixUnit, rangeInput: barePostfixMatch[3] };
  }

  const prefixMatch = /^(?:the )?(.+) (.+) ([a-z]+)$/.exec(input);
  const prefixUnit = parseUnit(prefixMatch?.[3]);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixUnit) {
    return { ordinalInput: prefixMatch[2], unit: prefixUnit, rangeInput: prefixMatch[1] };
  }

  return null;
}

// Selects the ordinal week or month inside an already-resolved range.
function selectOrdinalCalendarUnitRange(
  range: Extract<DateValue, { kind: "range" }>,
  unit: "week" | "month",
  ordinal: number,
): DateValue | null {
  const start = unit === "week" ? range.start.add({ weeks: ordinal - 1 }) : range.start.add({ months: ordinal - 1 });
  const end = unit === "week" ? start.add({ days: 6 }) : start.add({ months: 1 }).subtract({ days: 1 });
  if (comparePlainDate(start, range.end) > 0) {
    return null;
  }

  return { kind: "range", start, end: comparePlainDate(end, range.end) <= 0 ? end : range.end };
}

// Parses phrases such as "tomorrow next month" by projecting one date anchor into a relative range.
function parseShiftedDateAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const parts = parseShiftedDateAnchorParts(input, lookups);
  if (!parts) {
    return null;
  }

  const source = parseSimpleDateAnchor(parts.anchorInput, anchorDate, Temporal, lookups, context);
  const range = parseAnchorRange(parts.rangeInput, anchorDate, Temporal, context, lookups);
  if (!source || range?.kind !== "range") {
    return null;
  }

  return projectDateIntoRange(source, range, parts.unit);
}

// Splits a date-anchor phrase followed by a relative calendar range.
function parseShiftedDateAnchorParts(
  input: string,
  lookups: DateVocabularyLookups,
): { anchorInput: string; rangeInput: string; unit: CalendarRangeUnit } | null {
  const match = /^(.+) ((?:this|next|upcoming|future|last|previous|past) ([a-z]+))$/.exec(input);
  const unit = parseCalendarRangeUnit(match?.[3], lookups);
  if (!match?.[1] || !match[2] || !unit) {
    return null;
  }

  return { anchorInput: match[1], rangeInput: match[2], unit };
}

// Maps relative range nouns into the calendar unit used for projection.
function parseCalendarRangeUnit(input: string | undefined, lookups: DateVocabularyLookups): CalendarRangeUnit | null {
  if (input === "quarter") {
    return "quarter";
  }

  const unit = input ? lookups.durationUnits.get(input) : undefined;
  return unit === "week" || unit === "month" || unit === "year" ? unit : null;
}

// Resolves the range that a shifted date anchor projects into.
function parseAnchorRange(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  return parseRelativeModifierExpression(input, anchorDate, context, lookups) ?? parseQuarterRange(input, anchorDate, Temporal);
}

// Resolves non-composite single-date anchors used as the source for calendar projection.
function parseSimpleDateAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const bareAnchor = parseBareDateAnchor(input, anchorDate, lookups);
  if (bareAnchor) {
    return bareAnchor;
  }

  const relativeModifier = parseRelativeModifierExpression(input, anchorDate, context, lookups);
  if (relativeModifier?.kind === "single") {
    return relativeModifier.date;
  }

  return parseNamedDate(input, anchorDate.year, Temporal, lookups, context);
}

// Projects an anchor date into the requested range while preserving the relevant calendar position.
function projectDateIntoRange(
  source: PlainDate,
  range: Extract<DateValue, { kind: "range" }>,
  unit: CalendarRangeUnit,
): PlainDate | null {
  if (unit === "week") {
    const date = firstWeekdayOnOrAfter(range.start, source.dayOfWeek);
    return comparePlainDate(date, range.end) <= 0 ? date : null;
  }

  if (unit === "month" || unit === "quarter") {
    return createDateInRange(range.start, range.end, range.start.month, source.day);
  }

  return createDateInRange(range.start, range.end, source.month, source.day);
}

// Creates a date inside the range, clamping impossible days to the end of that month.
function createDateInRange(start: PlainDate, end: PlainDate, month: number, day: number): PlainDate | null {
  let cursor = start.with({ month, day: 1 });
  const targetDay = Math.min(day, cursor.daysInMonth);
  cursor = cursor.with({ day: targetDay });

  return comparePlainDate(cursor, start) >= 0 && comparePlainDate(cursor, end) <= 0 ? cursor : null;
}

// Parses bare date anchors such as "today", "tomorrow", or "yesterday".
export function parseBareDateAnchor(input: string, anchorDate: PlainDate, lookups: DateVocabularyLookups): PlainDate | null {
  if (!lookups.relatives.has(input as never)) {
    return null;
  }

  switch (input) {
    case "today":
    case "now":
      return anchorDate;
    case "tomorrow":
      return anchorDate.add({ days: 1 });
    case "yesterday":
      return anchorDate.subtract({ days: 1 });
    default:
      return null;
  }
}

// Parses anchors such as "first sunday of next month" or "next month first sunday".
function parseOrdinalWeekdayInRangeAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const parts = parseOrdinalWeekdayInRangeParts(input);
  if (!parts) {
    return null;
  }

  const ordinal = parseOrdinal(parts.ordinalInput);
  const weekday = lookups.weekdays.get(parts.weekdayInput);
  const range = parseAnchorRange(parts.rangeInput, anchorDate, Temporal, context, lookups);
  if (!ordinal || !weekday || range?.kind !== "range") {
    return null;
  }

  const date = firstWeekdayOnOrAfter(range.start, weekday).add({ weeks: ordinal - 1 });
  return comparePlainDate(date, range.end) <= 0 ? date : null;
}

// Splits ordinal weekday-in-range phrases into ordinal, weekday, and range text.
function parseOrdinalWeekdayInRangeParts(
  input: string,
): { ordinalInput: string; weekdayInput: string; rangeInput: string } | null {
  const postfixMatch = /^(?:the )?(.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2] && postfixMatch[3]) {
    return { ordinalInput: postfixMatch[1], weekdayInput: postfixMatch[2], rangeInput: postfixMatch[3] };
  }

  const barePostfixMatch = /^(?:the )?(.+) ([a-z]+) ((?:this|next|upcoming|future|last|previous|past) [a-z]+)$/.exec(input);
  if (barePostfixMatch?.[1] && barePostfixMatch[2] && barePostfixMatch[3]) {
    return { ordinalInput: barePostfixMatch[1], weekdayInput: barePostfixMatch[2], rangeInput: barePostfixMatch[3] };
  }

  const prefixMatch = /^(?:the )?(.+) (.+) ([a-z]+)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixMatch[3]) {
    return { ordinalInput: prefixMatch[2], weekdayInput: prefixMatch[3], rangeInput: prefixMatch[1] };
  }

  return null;
}

// Parses anchors such as "sunday of next week" or "next week sunday" when the range has one match.
function parseUniqueWeekdayInRangeAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const parts = parseWeekdayInRangeParts(input);
  if (!parts) {
    return null;
  }

  const weekday = lookups.weekdays.get(parts.weekdayInput);
  const range = parseAnchorRange(parts.rangeInput, anchorDate, Temporal, context, lookups);
  if (!weekday || range?.kind !== "range") {
    return null;
  }

  const date = firstWeekdayOnOrAfter(range.start, weekday);
  if (comparePlainDate(date, range.end) > 0 || comparePlainDate(date.add({ days: 7 }), range.end) <= 0) {
    return null;
  }

  return date;
}

// Splits weekday-in-range phrases into weekday and range text.
function parseWeekdayInRangeParts(input: string): { weekdayInput: string; rangeInput: string } | null {
  const postfixMatch = /^(?:the )?([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2]) {
    return { weekdayInput: postfixMatch[1], rangeInput: postfixMatch[2] };
  }

  const prefixMatch = /^(?:the )?(.+) ([a-z]+)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2]) {
    return { weekdayInput: prefixMatch[2], rangeInput: prefixMatch[1] };
  }

  return null;
}

// Parses anchors such as "second weekend of next month" or "next month second weekend".
function parseOrdinalDayGroupInRangeAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const parts = parseOrdinalDayGroupInRangeParts(input);
  if (!parts) {
    return null;
  }

  const ordinal = parseOrdinal(parts.ordinalInput);
  const group = parseDayGroup(parts.dayGroupInput);
  const range = parseAnchorRange(parts.rangeInput, anchorDate, Temporal, context, lookups);
  if (!ordinal || !group || range?.kind !== "range") {
    return null;
  }

  const dates = expandWeekdaysBetween(range.start, range.end, group === "weekend" ? [6, 7] : [1, 2, 3, 4, 5]);
  const groupStartIndex = (ordinal - 1) * datesPerGroup(group);
  const selectedDates = dates.slice(groupStartIndex, groupStartIndex + datesPerGroup(group));
  if (selectedDates.length !== datesPerGroup(group)) {
    return null;
  }

  return { kind: "range", start: selectedDates[0] as PlainDate, end: selectedDates[selectedDates.length - 1] as PlainDate };
}

// Splits ordinal day-group-in-range phrases into ordinal, group, and range text.
function parseOrdinalDayGroupInRangeParts(
  input: string,
): { ordinalInput: string; dayGroupInput: string; rangeInput: string } | null {
  const postfixMatch = /^(?:the )?(.+) (weekend|weekends|weekday|weekdays) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2] && postfixMatch[3]) {
    return { ordinalInput: postfixMatch[1], dayGroupInput: postfixMatch[2], rangeInput: postfixMatch[3] };
  }

  const prefixMatch = /^(?:the )?(.+) (.+) (weekend|weekends|weekday|weekdays)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixMatch[3]) {
    return { ordinalInput: prefixMatch[2], dayGroupInput: prefixMatch[3], rangeInput: prefixMatch[1] };
  }

  return null;
}

// Maps supported day-group words to their canonical parser value.
function parseDayGroup(input: string): "weekend" | "weekdays" | null {
  if (input === "weekend" || input === "weekends") {
    return "weekend";
  }

  if (input === "weekday" || input === "weekdays") {
    return "weekdays";
  }

  return null;
}

// Returns the number of dates that make up a complete day group.
function datesPerGroup(group: "weekend" | "weekdays"): number {
  return group === "weekend" ? 2 : 5;
}

// Expands all matching weekdays inside an inclusive date range.
function expandWeekdaysBetween(start: PlainDate, end: PlainDate, weekdays: readonly number[]): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;

  while (comparePlainDate(cursor, end) <= 0) {
    if (weekdays.includes(cursor.dayOfWeek)) {
      dates.push(cursor);
    }

    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
