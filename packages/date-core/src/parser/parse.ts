import { normalizeInput } from "./normalize";
import { parseBareDateAnchor, parseDateAnchor, parseDateRangeAnchor } from "./strategies/anchors";
import { parseMonthRange } from "./strategies/month";
import { parseMonthDayNumberSelection } from "./strategies/month-day-selection";
import { parseNamedDate } from "./strategies/named-date";
import { parseNumericCandidates } from "./strategies/numeric";
import { parseQuarterRange } from "./strategies/quarter";
import { parseRange } from "./strategies/range";
import { parseRecurring } from "./strategies/recurring";
import { parseRelativeExpression } from "./strategies/relative";
import { createCandidate, labelDateValue } from "./strategies/shared";
import {
  parseWeekdayInMonthWithOffset,
  parseWeekdayRelativeToAnchorWithOffset,
  parseOrdinalWeekdayRelativeToAnchor,
  parseWeekdaySelectionBetween,
  parseWeekdaySelectionForRelativeRange,
} from "./strategies/weekday-selection";
import { parseWeekRange } from "./strategies/week";
import { createDateVocabulary, createDateVocabularyLookups, type DateVocabularyLookups } from "./vocabulary";
import type { PlainDate, TemporalApi } from "../temporal/types";
import type {
  DateOrder,
  DateValue,
  NamedDatesVocabularyEntry,
  ParseDateContext,
  ParseDateResult,
  ResolvedParseDateContext,
} from "../types";

const DEFAULT_DATE_ORDER_PREFERENCE: DateOrder[] = ["DMY", "MDY", "YMD"];

export type ParseDateWithTemporalOptions = {
  namedDatesVocabulary?: readonly NamedDatesVocabularyEntry[];
};

export function parseDateWithTemporal(
  input: string,
  context: ParseDateContext,
  Temporal: TemporalApi,
  options: ParseDateWithTemporalOptions = {},
): ParseDateResult {
  const vocabulary = createDateVocabulary(options.namedDatesVocabulary);
  const lookups = createDateVocabularyLookups(vocabulary);
  const normalized = normalizeInput(input, lookups);
  const source = {
    normalizedInput: normalized.normalized,
    tokens: normalized.tokens,
    corrections: normalized.corrections,
  };

  if (!input.trim()) {
    return {
      status: "invalid",
      input,
      errors: [{ code: "empty-input", message: "Enter a date phrase." }],
      corrections: normalized.corrections,
    };
  }

  const resolved = resolveContext(context, Temporal);
  const anchorDate = resolved.anchor.toPlainDate();
  const numericCandidates = parseNumericCandidates(normalized.normalized, resolved, Temporal, source);

  if (numericCandidates.length === 1 && numericCandidates[0]) {
    return {
      status: "valid",
      input,
      value: numericCandidates[0].value,
      candidates: [numericCandidates[0]],
      corrections: normalized.corrections,
    };
  }

  if (numericCandidates.length > 1) {
    return {
      status: "ambiguous",
      input,
      candidates: numericCandidates,
      ambiguityGroups: [
        {
          id: "date-order",
          kind: "date-order",
          message: "Which date order did you mean?",
          options: numericCandidates.map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
            candidateIds: [candidate.id],
          })),
        },
      ],
      corrections: normalized.corrections,
    };
  }

  const value = parseKnownExpression(normalized.normalized, anchorDate, resolved, Temporal, lookups);

  if (!value) {
    return {
      status: "invalid",
      input,
      errors: [{ code: "unsupported-expression", message: "Calchemy does not understand this date phrase yet." }],
      corrections: normalized.corrections,
    };
  }

  const candidate = createCandidate("best", value, 1, labelDateValue(value), source);

  return {
    status: "valid",
    input,
    value,
    candidates: [candidate],
    corrections: normalized.corrections,
  };
}

function resolveContext(context: ParseDateContext, Temporal: TemporalApi): ResolvedParseDateContext {
  const anchor = context.anchor ?? Temporal.Now.zonedDateTimeISO();

  return {
    anchor,
    locale: context.locale ?? "en-US",
    weekStartsOn: context.weekStartsOn ?? 0,
    dateOrderPreference: normalizeDateOrderPreference(context.dateOrderPreference),
    lastNDaysIncludesToday: context.lastNDaysIncludesToday ?? true,
    ...(context.holidays ? { holidays: context.holidays } : {}),
  };
}

function normalizeDateOrderPreference(value: DateOrder[] | undefined): DateOrder[] {
  if (!value || value.length === 0) {
    return DEFAULT_DATE_ORDER_PREFERENCE;
  }

  return Array.from(new Set(value));
}

function parseKnownExpression(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const exclusion = parseHolidayExclusion(input, anchorDate, context, Temporal, lookups);
  if (exclusion) {
    return exclusion;
  }

  const bareAnchor = parseBareDateAnchor(input, anchorDate, lookups);
  if (bareAnchor) {
    return { kind: "single", date: bareAnchor };
  }

  const relative = parseRelativeExpression(input, anchorDate, context, lookups);
  if (relative) {
    return relative;
  }

  const dateAnchor = parseDateAnchor(input, anchorDate, Temporal, lookups, context);
  if (dateAnchor) {
    return { kind: "single", date: dateAnchor };
  }

  const dateRangeAnchor = parseDateRangeAnchor(input, anchorDate, Temporal, context, lookups);
  if (dateRangeAnchor) {
    return dateRangeAnchor;
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

  const monthRange = parseMonthRange(input, anchorDate, Temporal);
  if (monthRange) {
    return monthRange;
  }

  const quarterRange = parseQuarterRange(input, anchorDate, Temporal);
  if (quarterRange) {
    return quarterRange;
  }

  const weekRange = parseWeekRange(input, anchorDate, Temporal);
  if (weekRange) {
    return weekRange;
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
  if (date) {
    return { kind: "single", date };
  }

  return null;
}

// Applies trailing holiday exclusions to any parsed range expression.
function parseHolidayExclusion(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const baseInput = input.replace(/\s+(?:excluding|skip) holidays$/, "");
  if (baseInput === input) {
    return null;
  }

  const baseValue = parseKnownExpression(baseInput, anchorDate, context, Temporal, lookups);
  if (baseValue?.kind !== "range") {
    return null;
  }

  return { kind: "multiple", dates: expandDatesBetween(baseValue.start, baseValue.end).filter((date) => !context.holidays?.includes(date)) };
}

// Expands every calendar date in an inclusive range.
function expandDatesBetween(start: PlainDate, end: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;

  while (cursor.toString().localeCompare(end.toString()) <= 0) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
  }

  return dates;
}
