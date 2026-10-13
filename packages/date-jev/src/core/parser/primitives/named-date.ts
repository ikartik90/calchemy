import { expandTwoDigitYear } from "./date-math";
import { comparePlainDate } from "./shared";
import { normalizeVocabularyValue, type DateVocabularyLookups } from "../vocabulary";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { NamedDatesVocabularyEntry, ResolvedParseDateContext } from "../../types";

/**
 * Resolves a named phrase to the sorted, de-duplicated dates it stands for.
 *
 * A configured entry may return one date a year (`christmas`) or many
 * (`board meeting`); both come back as a list so callers treat them alike. A
 * month-name date such as `july 1 27` is a one-item list. Returns `null` when
 * the phrase is not a named date at all, and an empty list when it is one but
 * has no dates in that year.
 *
 * Example: `parseNamedDates("christmas 2026", 2026, Temporal, lookups, context)` returns `[2026-12-25]`.
 */
export function parseNamedDates(
  input: string,
  anchorYear: number,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate[] | null {
  const compact = input.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  const namedDates = parseConfiguredNamedDates(compact, anchorYear, lookups, context);
  if (namedDates) {
    return namedDates;
  }

  const monthNameDate = parseMonthNameDate(compact, anchorYear, Temporal, lookups);
  return monthNameDate ? [monthNameDate] : null;
}

/**
 * Asks a vocabulary entry for its dates in a year, whichever resolver it
 * defines, and normalizes the answer to a sorted list without duplicates.
 *
 * Example: `resolveNamedDateEntryDates(christmasEntry, 2026, context)` returns `[2026-12-25]`.
 */
export function resolveNamedDateEntryDates(
  entry: NamedDatesVocabularyEntry,
  year: number,
  context: ResolvedParseDateContext,
): PlainDate[] {
  const resolved = entry.resolveDates
    ? entry.resolveDates({ year, context })
    : [entry.resolveDate({ year, context })];
  const unique = new Map<string, PlainDate>();

  for (const date of resolved) {
    if (date) {
      unique.set(date.toString(), date);
    }
  }

  return Array.from(unique.values()).sort(comparePlainDate);
}

// Example: `parseMonthNameDate("july 1 27", 2026, Temporal, lookups)` returns July 1, 2027.
function parseMonthNameDate(
  input: string,
  anchorYear: number,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const monthFirst = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{2,4}))?$/.exec(input);
  if (monthFirst?.[1] && monthFirst[2]) {
    return createMonthNameDate(monthFirst[1], monthFirst[2], monthFirst[3], anchorYear, Temporal, lookups);
  }

  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{2,4}))?$/.exec(input);
  if (dayFirst?.[1] && dayFirst[2]) {
    return createMonthNameDate(dayFirst[2], dayFirst[1], dayFirst[3], anchorYear, Temporal, lookups);
  }

  return null;
}

// Example: `createMonthNameDate("july", "1", "27", 2026, Temporal, lookups)` creates July 1, 2027.
function createMonthNameDate(
  monthInput: string,
  dayInput: string,
  yearInput: string | undefined,
  anchorYear: number,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const month = lookups.months.get(monthInput);
  if (!month) {
    return null;
  }

  const day = Number(dayInput);
  const year = yearInput ? expandTwoDigitYear(Number(yearInput), anchorYear) : anchorYear;

  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
  } catch {
    return null;
  }
}

// Example: `parseConfiguredNamedDates("easter next year", 2026, lookups, context)` resolves the configured Easter date.
function parseConfiguredNamedDates(
  input: string,
  anchorYear: number,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate[] | null {
  const normalized = normalizeVocabularyValue(input);
  const relativeYearMatch = /^(.*) (this|next|last|previous) year$/.exec(normalized);
  const yearMatch = /^(.*) (\d{2,4})$/.exec(normalized);
  const name = relativeYearMatch?.[1] ?? yearMatch?.[1] ?? normalized;
  const year = relativeYearMatch?.[2]
    ? resolveRelativeYear(relativeYearMatch[2], anchorYear)
    : yearMatch?.[2]
      ? expandTwoDigitYear(Number(yearMatch[2]), anchorYear)
      : anchorYear;

  for (const entry of lookups.namedDates) {
    if (normalizeVocabularyValue(entry.value) !== name) {
      continue;
    }

    return resolveNamedDateEntryDates(entry, year, context);
  }

  return null;
}

// Example: `resolveRelativeYear("next", 2026)` returns `2027`.
function resolveRelativeYear(value: string, anchorYear: number): number {
  if (value === "next") {
    return anchorYear + 1;
  }

  if (value === "last" || value === "previous") {
    return anchorYear - 1;
  }

  return anchorYear;
}
