import { resolveRawBoundary } from "./boundary";
import { expandValueDates } from "./sampler";
import { comparePlainDate } from "../primitives/shared";
import type { ExclusionSlice } from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type LegacyResolver = (input: string) => DateValue | null;
export function applyExclusions(
  value: DateValue,
  exclusions: readonly ExclusionSlice[],
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  if (exclusions.length === 0) {
    return value;
  }

  const predicates = exclusions.map((exclusion) =>
    parseExclusionPredicate(exclusion.input, anchorDate, Temporal, context, lookups),
  );
  if (predicates.some((predicate) => !predicate)) {
    return null;
  }

  const dates = expandValueDates(value).filter((date) => !predicates.some((predicate) => predicate?.(date)));
  return { kind: "multiple", dates };
}

function parseExclusionPredicate(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): ((date: PlainDate) => boolean) | null {
  const parts = splitList(input);
  if (parts.length > 1) {
    const predicates = parts.map((part) => parseSingleExclusionPredicate(part, anchorDate, Temporal, context, lookups));
    if (predicates.some((predicate) => !predicate)) {
      return null;
    }

    return (date) => predicates.some((predicate) => predicate?.(date));
  }

  return parseSingleExclusionPredicate(input, anchorDate, Temporal, context, lookups);
}

function parseSingleExclusionPredicate(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): ((date: PlainDate) => boolean) | null {
  if (input === "holidays") {
    return (date) => context.holidays?.includes(date) ?? false;
  }

  if (input === "weekend" || input === "weekends") {
    return (date) => date.dayOfWeek === 6 || date.dayOfWeek === 7;
  }

  if (input === "weekday" || input === "weekdays") {
    return (date) => date.dayOfWeek >= 1 && date.dayOfWeek <= 5;
  }

  const months = parseMonthExclusionList(input, lookups);
  if (months.length > 0) {
    return (date) => months.includes(date.month);
  }

  const years = parseYearExclusionList(input);
  if (years.length > 0) {
    return (date) => years.includes(date.year);
  }

  const value = resolveRawBoundary(input, anchorDate, Temporal, context, lookups);
  if (value?.kind === "single") {
    return (date) => date.equals(value.date);
  }

  if (value?.kind === "range") {
    return (date) => comparePlainDate(date, value.start) >= 0 && comparePlainDate(date, value.end) <= 0;
  }

  if (value?.kind === "multiple") {
    return (date) => value.dates.some((excludedDate) => excludedDate.equals(date));
  }

  return null;
}

function splitList(input: string): string[] {
  return input
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseMonthExclusionList(input: string, lookups: DateVocabularyLookups): number[] {
  const values = splitList(input).map((value) => lookups.months.get(value));

  if (values.length === 0 || values.some((value) => value === undefined)) {
    return [];
  }

  return Array.from(new Set(values as number[]));
}

function parseYearExclusionList(input: string): number[] {
  const values = splitList(input);

  if (values.length === 0 || values.some((value) => !/^\d{4}$/.test(value))) {
    return [];
  }

  return Array.from(new Set(values.map(Number)));
}
