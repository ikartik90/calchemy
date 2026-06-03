import { parseDateAnchor, parseDateRangeAnchor } from "./anchors";
import { parseMonthRange } from "./month";
import { parseMonthDayNumberSelection } from "./month-day-selection";
import { parseNamedDate } from "../primitives/named-date";
import { parseQuarterRange } from "./quarter";
import { parseRange } from "./range";
import { parseRecurring } from "./recurring";
import { parseRelativeModifierExpression } from "./relative";
import { parseRelativeExpression } from "./relative";
import { comparePlainDate, parseAmount, toDuration } from "../primitives/shared";
import {
  parseOrdinalWeekdayRelativeToAnchor,
  parseWeekdayInMonthWithOffset,
  parseWeekdayRelativeToAnchorWithOffset,
  parseWeekdaySelectionBetween,
  parseWeekdaySelectionForRelativeRange,
} from "./weekday-selection";
import { parseWeekRange } from "./week";
import type { BoundarySlice } from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, DurationUnit, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export function resolveBoundary(
  boundary: BoundarySlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  if (boundary.kind === "between") {
    const start = resolveBoundaryEndpoint(boundary.startInput, "start", anchorDate, Temporal, context, lookups);
    const end = resolveBoundaryEndpoint(boundary.endInput, "end", anchorDate, Temporal, context, lookups);
    return start && end && comparePlainDate(start, end) <= 0 ? { kind: "range", start, end } : null;
  }

  return resolveRawBoundary(boundary.input, anchorDate, Temporal, context, lookups);
}

export function resolveRawBoundary(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const bareAnchor = parseDateAnchor(input, anchorDate, Temporal, lookups, context);
  if (bareAnchor) {
    return { kind: "single", date: bareAnchor };
  }

  const durationFromAnchor = parseDurationFromAnchorExpression(input, anchorDate, Temporal, lookups, context);
  if (durationFromAnchor) {
    return durationFromAnchor;
  }

  const relativeExpression = parseRelativeExpression(input, anchorDate, context, lookups);
  if (relativeExpression) {
    return relativeExpression;
  }

  const relative = parseRelativeModifierExpression(input, anchorDate, context, lookups);
  if (relative) {
    return relative;
  }

  const rangeAnchor = parseDateRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (rangeAnchor) {
    return rangeAnchor;
  }

  const weekdaySelection = parseWeekdaySelectionBetween(input, anchorDate, Temporal, lookups, context);
  if (weekdaySelection) {
    return weekdaySelection;
  }

  const weekdayInMonth = parseWeekdayInMonthWithOffset(input, anchorDate, lookups);
  if (weekdayInMonth) {
    return weekdayInMonth;
  }

  const weekdayRelativeToAnchor = parseWeekdayRelativeToAnchorWithOffset(input, anchorDate, Temporal, lookups, context);
  if (weekdayRelativeToAnchor) {
    return weekdayRelativeToAnchor;
  }

  const weekdaySelectionForRange = parseWeekdaySelectionForRelativeRange(input, anchorDate, Temporal, lookups, context);
  if (weekdaySelectionForRange) {
    return weekdaySelectionForRange;
  }

  const ordinalWeekday = parseOrdinalWeekdayRelativeToAnchor(input, anchorDate, Temporal, lookups, context);
  if (ordinalWeekday) {
    return ordinalWeekday;
  }

  const monthDayNumberSelection = parseMonthDayNumberSelection(input, anchorDate, Temporal, lookups, context);
  if (monthDayNumberSelection) {
    return monthDayNumberSelection;
  }

  const shorthandRangeList = parseShorthandRangeList(input, anchorDate, Temporal);
  if (shorthandRangeList) {
    return shorthandRangeList;
  }

  const namedMonth = resolveNamedMonthRange(input, anchorDate, Temporal, lookups);
  if (namedMonth) {
    return namedMonth;
  }

  const month = parseMonthRange(input, anchorDate, Temporal);
  if (month) {
    return month;
  }

  const quarter = parseQuarterRange(input, anchorDate, Temporal);
  if (quarter) {
    return quarter;
  }

  const week = parseWeekRange(input, anchorDate, Temporal);
  if (week) {
    return week;
  }

  const range = parseRange(input, anchorDate, Temporal, lookups, context);
  if (range) {
    return range;
  }

  const recurring = parseRecurring(input, anchorDate, context, lookups);
  if (recurring) {
    return recurring;
  }

  const date = parseNamedDate(input, anchorDate.year, Temporal, lookups, context);
  return date ? { kind: "single", date } : null;
}

// Parses spans such as "12 weeks from 3/6/26" using any supported date anchor.
function parseDurationFromAnchorExpression(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^(.+) ([a-z]+) from (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3] || match[3] === "now") {
    return null;
  }

  const amount = parseAmount(match[1]);
  const unit = lookups.durationUnits.get(match[2]) as DurationUnit | undefined;
  const start = parseDateAnchor(match[3], anchorDate, Temporal, lookups, context);
  if (!amount || !unit || !start) {
    return null;
  }

  return { kind: "range", start, end: start.add(toDuration(amount, unit)) };
}

// Parses shorthand range lists such as "w51 and w52" or "m3 and m4 next year".
function parseShorthandRangeList(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const match = /^((?:[mw]\s*)?\d+(?:\s*(?:and|or|,)\s*(?:[mw]\s*)?\d+)+)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const tokens = match[1]
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const firstKind = parseShorthandRangeKind(tokens[0]);
  if (!firstKind) {
    return null;
  }

  const suffix = match[2] ? ` ${match[2]} year` : match[3] ? ` ${match[3]}` : "";
  const ranges = tokens.map((token) => {
    const expression = normalizeShorthandRangeToken(token, firstKind);
    if (!expression) {
      return null;
    }

    return firstKind === "week"
      ? parseWeekRange(`${expression}${suffix}`, anchorDate, Temporal)
      : parseMonthRange(`${expression}${suffix}`, anchorDate, Temporal);
  });

  if (ranges.some((range) => range?.kind !== "range")) {
    return null;
  }

  return {
    kind: "multiple",
    dates: (ranges as Array<Extract<DateValue, { kind: "range" }>>).flatMap((range) => expandDatesBetween(range.start, range.end)),
  };
}

function parseShorthandRangeKind(input: string | undefined): "week" | "month" | null {
  if (input?.startsWith("w")) {
    return "week";
  }

  if (input?.startsWith("m")) {
    return "month";
  }

  return null;
}

function normalizeShorthandRangeToken(input: string, kind: "week" | "month"): string | null {
  const match = /^(?:(w|m)\s*)?(\d+)$/.exec(input);
  if (!match?.[2]) {
    return null;
  }

  const prefix = match[1] ?? (kind === "week" ? "w" : "m");
  if ((kind === "week" && prefix !== "w") || (kind === "month" && prefix !== "m")) {
    return null;
  }

  return `${prefix}${match[2]}`;
}

function resolveBoundaryEndpoint(
  input: string,
  side: "start" | "end",
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const value = resolveRawBoundary(input, anchorDate, Temporal, context, lookups);
  if (value?.kind === "single") {
    return value.date;
  }

  if (value?.kind === "range") {
    return side === "start" ? value.start : value.end;
  }

  return null;
}

function resolveNamedMonthRange(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const month = lookups.months.get(input);
  if (!month) {
    return null;
  }

  const start = Temporal.PlainDate.from({ year: anchorDate.year, month, day: 1 });
  return { kind: "range", start, end: start.with({ day: start.daysInMonth }) };
}

function expandDatesBetween(start: PlainDate, end: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;

  while (comparePlainDate(cursor, end) <= 0) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
