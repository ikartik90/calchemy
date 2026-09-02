import { expandTwoDigitYear } from "./date-math";
import { parseAmount, parseOrdinal } from "./numbers";
import { createCandidate, labelDateValue } from "./shared";
import { trimLeadingSeparators, trimTrailingSeparators, type StandardChunk } from "../chunks";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type {
  AmbiguousParseDateResult,
  Candidate,
  DateValue,
  ParseDateResult,
  ResolvedParseDateContext,
  ValidParseDateResult,
} from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type NestedPastMonthDayYear = {
  monthName: string;
  month: number;
  day: number;
  expandedYear: number;
  start: number;
  end: number;
};

// Example: `findNestedPastMonthDayYear("from april 15 until june", lookups, 2026)` finds `april 15`.
export function findNestedPastMonthDayYear(
  input: string,
  lookups: DateVocabularyLookups,
  anchorYear: number,
): NestedPastMonthDayYear | null {
  const monthNames = [...lookups.months.keys()].sort((left, right) => right.length - left.length);
  if (monthNames.length === 0) {
    return null;
  }

  const monthDayPattern = `\\b(${monthNames.join("|")}) (\\d{1,2})(?:st|nd|rd|th)?\\b`;

  // A phrase with two or more `<month> <day>` expressions is a concrete date range or list
  // (e.g. `between aug 15 and sep 30`), so the numbers are calendar days rather than a
  // possible `<month> <two-digit year>` shorthand and there is no day-vs-year ambiguity.
  if ((input.match(new RegExp(monthDayPattern, "g")) ?? []).length >= 2) {
    return null;
  }

  const pattern = new RegExp(monthDayPattern);
  const match = pattern.exec(input);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const month = lookups.months.get(match[1]);
  if (!month) {
    return null;
  }

  const day = Number(match[2]);
  const expandedYear = expandTwoDigitYear(day, anchorYear);
  if (day <= 12 || day > 31 || expandedYear >= anchorYear) {
    return null;
  }

  return {
    monthName: match[1],
    month,
    day,
    expandedYear,
    start: match.index,
    end: match.index + match[0].length,
  };
}

// Example: `parseMonthDayYearResult("apr 15", chunks, context, Temporal, lookups, source)` returns day-vs-year ambiguity.
export function parseMonthDayYearResult(
  input: string,
  chunks: readonly StandardChunk[],
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  source: Candidate["source"],
  corrections: ParseDateResult["corrections"],
): ParseDateResult | null {
  const parsed = parseSingleMonthDayExpression(chunks);
  if (!parsed) {
    return null;
  }

  const { month, day } = parsed;
  const anchorYear = context.referenceDate.year;
  const expandedYear = expandTwoDigitYear(day, anchorYear);
  if (day <= 12 || day > 31 || expandedYear >= anchorYear) {
    return null;
  }

  const dayValue = resolveMonthDay(month, day, anchorYear, Temporal);
  const yearValue = resolveMonthYearRange(month, expandedYear, Temporal);
  if (!dayValue || !yearValue) {
    return null;
  }

  return toMonthDayYearAmbiguousResult(input, dayValue, yearValue, context, source, corrections);
}

// Example: `parseMonthDayListResult("aug 10, 14", chunks, context, Temporal, lookups, source)` returns ambiguity.
export function parseMonthDayListResult(
  input: string,
  chunks: readonly StandardChunk[],
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  source: Candidate["source"],
  corrections: ParseDateResult["corrections"],
): ParseDateResult | null {
  const parsed = parseMonthDayListExpression(chunks, lookups);
  if (!parsed) {
    return null;
  }

  const { month, days } = parsed;
  const anchorYear = context.referenceDate.year;

  if (days.length >= 3) {
    return toValidResult(input, resolveMonthDayList(month, days, anchorYear, Temporal), source, corrections);
  }

  const listValue = resolveMonthDayList(month, days, anchorYear, Temporal);
  const firstDay = days[0];
  const secondDay = days[1];
  if (firstDay === undefined || secondDay === undefined) {
    return null;
  }

  const yearValue = resolveMonthDayYear(month, firstDay, secondDay, anchorYear, Temporal);

  if (listValue && yearValue && secondDay <= 31) {
    return toAmbiguousResult(input, listValue, yearValue, context, source, corrections);
  }

  if (yearValue) {
    return toValidResult(input, yearValue, source, corrections);
  }

  if (listValue) {
    return toValidResult(input, listValue, source, corrections);
  }

  return null;
}

// Example: `parseSingleMonthDayExpression(chunksFor("april 15"))` returns month 4 and day 15.
function parseSingleMonthDayExpression(
  chunks: readonly StandardChunk[],
): { month: number; day: number } | null {
  const expression = trimTrailingSeparators(trimLeadingSeparators(chunks));
  if (expression.length !== 2) {
    return null;
  }

  const monthChunk = expression[0];
  const dayChunk = expression[1];
  if (monthChunk?.kind !== "month") {
    return null;
  }

  if (dayChunk?.kind !== "number" && dayChunk?.kind !== "ordinal") {
    return null;
  }

  return { month: monthChunk.value, day: dayChunk.value };
}

// Example: `parseMonthDayListExpression(chunksFor("august 10 and 14"), lookups)` returns month 8 and days `[10, 14]`.
export function parseMonthDayListExpression(
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): { month: number; days: number[] } | null {
  const expression = trimTrailingSeparators(trimLeadingSeparators(chunks));
  if (expression.length < 3) {
    return null;
  }

  const monthChunk = expression[0];
  if (monthChunk?.kind !== "month") {
    return null;
  }

  const days: number[] = [];
  for (let index = 1; index < expression.length; index += 1) {
    const chunk = expression[index];
    if (chunk?.kind === "number" || chunk?.kind === "ordinal") {
      days.push(chunk.value);
      continue;
    }

    if (chunk?.kind === "connector" && chunk.value === "and") {
      continue;
    }

    return null;
  }

  if (days.length < 2) {
    return null;
  }

  return { month: monthChunk.value, days };
}

// Example: `parseMonthDayRangeExpression(chunksFor("august 10-14"), lookups)` returns month 8 with days 10 and 14.
export function parseMonthDayRangeExpression(
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): { month: number; startDay: number; endDay: number } | null {
  const expression = trimTrailingSeparators(trimLeadingSeparators(chunks));
  if (expression.length !== 4) {
    return null;
  }

  const monthChunk = expression[0];
  const startChunk = expression[1];
  const separatorChunk = expression[2];
  const endChunk = expression[3];
  if (
    monthChunk?.kind !== "month" ||
    (startChunk?.kind !== "number" && startChunk?.kind !== "ordinal") ||
    separatorChunk?.kind !== "separator" ||
    separatorChunk.value !== "-" ||
    (endChunk?.kind !== "number" && endChunk?.kind !== "ordinal")
  ) {
    return null;
  }

  return {
    month: monthChunk.value,
    startDay: startChunk.value,
    endDay: endChunk.value,
  };
}

// Example: `parseMonthDayRangeFromInput("august 10-14", lookups)` returns month 8 with days 10 and 14.
export function parseMonthDayRangeFromInput(
  input: string,
  lookups: DateVocabularyLookups,
): { month: number; startDay: number; endDay: number } | null {
  const match = /^([a-z]+) (\d{1,2}(?:st|nd|rd|th)?)\s*-\s*(\d{1,2}(?:st|nd|rd|th)?)$/.exec(input.trim());
  const monthName = match?.[1];
  const startDayInput = match?.[2];
  const endDayInput = match?.[3];
  const month = monthName ? lookups.months.get(monthName) : undefined;
  const startDay = startDayInput ? parseDayToken(startDayInput) : null;
  const endDay = endDayInput ? parseDayToken(endDayInput) : null;

  if (!month || startDay === null || endDay === null || startDay < 1 || endDay < 1 || startDay > 31 || endDay > 31) {
    return null;
  }

  return { month, startDay, endDay };
}

// Example: `resolveMonthDayRange(8, 10, 14, 2026, Temporal)` returns August 10 through 14 in 2026.
export function resolveMonthDayRange(
  month: number,
  startDay: number,
  endDay: number,
  anchorYear: number,
  Temporal: TemporalApi,
): DateValue | null {
  try {
    const start = Temporal.PlainDate.from({ year: anchorYear, month, day: startDay }, { overflow: "reject" });
    const end = Temporal.PlainDate.from({ year: anchorYear, month, day: endDay }, { overflow: "reject" });
    return start.toString() <= end.toString() ? { kind: "range", start, end } : null;
  } catch {
    return null;
  }
}

// Example: `parseMonthDayListFromInput("august 10 14 and 17", lookups)` returns month 8 and days `[10, 14, 17]`.
export function parseMonthDayListFromInput(
  input: string,
  lookups: DateVocabularyLookups,
): { month: number; days: number[] } | null {
  const match = /^([a-z]+) (.+)$/.exec(input.trim());
  const monthName = match?.[1];
  const remainder = match?.[2];
  const month = monthName ? lookups.months.get(monthName) : undefined;
  if (!month || !remainder) {
    return null;
  }

  const days = remainder
    .replace(/\band\b/g, " ")
    .split(/[\s,]+/)
    .map((token) => parseDayToken(token))
    .filter((day): day is number => day !== null);

  if (days.length < 2 || days.some((day) => day < 1 || day > 31)) {
    return null;
  }

  const hasListMarker = /,|\band\b/.test(remainder);
  if (days.length === 2 && !hasListMarker) {
    return null;
  }

  return { month, days };
}

// Example: `parseDayToken("10th")` returns `10`.
function parseDayToken(token: string): number | null {
  return parseOrdinal(token) ?? parseAmount(token);
}

// Example: `resolveMonthDayList(8, [10, 14, 17], 2026, Temporal)` returns August 10, 14, and 17 in 2026.
export function resolveMonthDayList(
  month: number,
  days: number[],
  anchorYear: number,
  Temporal: TemporalApi,
): DateValue | null {
  const dates: PlainDate[] = [];

  for (const day of days) {
    if (day < 1 || day > 31) {
      return null;
    }

    try {
      dates.push(Temporal.PlainDate.from({ year: anchorYear, month, day }, { overflow: "reject" }));
    } catch {
      return null;
    }
  }

  return { kind: "multiple", dates };
}

// Example: `resolveMonthDay(4, 15, 2026, Temporal)` returns April 15, 2026.
function resolveMonthDay(
  month: number,
  day: number,
  anchorYear: number,
  Temporal: TemporalApi,
): DateValue | null {
  try {
    const date = Temporal.PlainDate.from({ year: anchorYear, month, day }, { overflow: "reject" });
    return { kind: "single", date };
  } catch {
    return null;
  }
}

// Example: `resolveMonthYearRange(4, 2015, Temporal)` returns April 2015.
function resolveMonthYearRange(month: number, year: number, Temporal: TemporalApi): DateValue | null {
  try {
    const start = Temporal.PlainDate.from({ year, month, day: 1 });
    const end = start.with({ day: start.daysInMonth });
    return { kind: "range", start, end };
  } catch {
    return null;
  }
}

// Example: `resolveMonthDayYear(8, 10, 14, 2026, Temporal)` returns August 10, 2014.
function resolveMonthDayYear(
  month: number,
  day: number,
  yearPart: number,
  anchorYear: number,
  Temporal: TemporalApi,
): DateValue | null {
  const year = expandTwoDigitYear(yearPart, anchorYear);

  try {
    const date = Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
    return { kind: "single", date };
  } catch {
    return null;
  }
}

// Example: `toMonthDayYearAmbiguousResult(...)` returns day and month-year candidates for `apr 15`.
function toMonthDayYearAmbiguousResult(
  input: string,
  dayValue: DateValue,
  yearValue: DateValue,
  context: ResolvedParseDateContext,
  source: Candidate["source"],
  corrections: ParseDateResult["corrections"],
): AmbiguousParseDateResult {
  const dayCandidate = createCandidate(
    "month-day",
    dayValue,
    0.95,
    formatSingleDateLabel(dayValue, context),
    source,
    dayValue.kind === "single"
      ? `Interpreted as ${dayValue.date.toLocaleString(context.locale, { dateStyle: "long" })}.`
      : undefined,
  );
  const yearCandidate = createCandidate(
    "month-year",
    yearValue,
    0.85,
    labelDateValue(yearValue),
    source,
    yearValue.kind === "range"
      ? `Interpreted as ${yearValue.start.toLocaleString(context.locale, { month: "long", year: "numeric" })}.`
      : undefined,
  );

  return {
    status: "ambiguous",
    input,
    candidates: [dayCandidate, yearCandidate],
    ambiguityGroups: [
      {
        id: "month-day-year",
        kind: "month-day-year",
        message: "Did you mean a calendar day or a month and year?",
        options: [
          {
            id: dayCandidate.id,
            label: dayCandidate.explanation ?? dayCandidate.label,
            candidateIds: [dayCandidate.id],
          },
          {
            id: yearCandidate.id,
            label: yearCandidate.explanation ?? yearCandidate.label,
            candidateIds: [yearCandidate.id],
          },
        ],
      },
    ],
    corrections,
    warnings: [],
  };
}

// Example: `toAmbiguousResult(...)` returns year and day-list candidates for `aug 10, 14`.
function toAmbiguousResult(
  input: string,
  listValue: DateValue,
  yearValue: DateValue,
  context: ResolvedParseDateContext,
  source: Candidate["source"],
  corrections: ParseDateResult["corrections"],
): AmbiguousParseDateResult {
  const yearCandidate = createCandidate(
    "month-day-year",
    yearValue,
    0.9,
    formatSingleDateLabel(yearValue, context),
    source,
    yearValue.kind === "single"
      ? `Interpreted as ${yearValue.date.toLocaleString(context.locale, { dateStyle: "long" })}.`
      : undefined,
  );
  const listCandidate = createCandidate(
    "month-day-list",
    listValue,
    0.9,
    formatMultipleDatesLabel(listValue, context),
    source,
    listValue.kind === "multiple"
      ? `Interpreted as ${listValue.dates.map((date) => date.toLocaleString(context.locale, { dateStyle: "long" })).join(" and ")}.`
      : undefined,
  );

  return {
    status: "ambiguous",
    input,
    candidates: [yearCandidate, listCandidate],
    ambiguityGroups: [
      {
        id: "month-day-list",
        kind: "month-day-list",
        message: "Did you mean a year or multiple days in the month?",
        options: [
          {
            id: yearCandidate.id,
            label: yearCandidate.explanation ?? yearCandidate.label,
            candidateIds: [yearCandidate.id],
          },
          {
            id: listCandidate.id,
            label: listCandidate.explanation ?? listCandidate.label,
            candidateIds: [listCandidate.id],
          },
        ],
      },
    ],
    corrections,
    warnings: [],
  };
}

// Example: `toValidResult(...)` returns a valid parse for three August dates.
function toValidResult(
  input: string,
  value: DateValue | null,
  source: Candidate["source"],
  corrections: ParseDateResult["corrections"],
): ValidParseDateResult | null {
  if (!value) {
    return null;
  }

  return {
    status: "valid",
    input,
    value,
    candidates: [createCandidate("best", value, 1, labelDateValue(value), source)],
    corrections,
    warnings: [],
  };
}

// Example: `formatSingleDateLabel({ kind: "single", date }, context)` returns a long-form label.
function formatSingleDateLabel(value: DateValue, context: ResolvedParseDateContext): string {
  return value.kind === "single" ? value.date.toLocaleString(context.locale, { dateStyle: "long" }) : labelDateValue(value);
}

// Example: `formatMultipleDatesLabel({ kind: "multiple", dates }, context)` returns a joined label.
function formatMultipleDatesLabel(value: DateValue, context: ResolvedParseDateContext): string {
  return value.kind === "multiple"
    ? value.dates.map((date) => date.toLocaleString(context.locale, { dateStyle: "long" })).join(", ")
    : labelDateValue(value);
}

