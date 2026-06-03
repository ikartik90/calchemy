import { expandTwoDigitYear } from "./date-math";
import { normalizeVocabularyValue, type DateVocabularyLookups } from "../vocabulary";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { ResolvedParseDateContext } from "../../types";

// Parses configured named dates and month-name dates into a PlainDate.
export function parseNamedDate(
  input: string,
  anchorYear: number,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const compact = input.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  const namedDate = parseConfiguredNamedDate(compact, anchorYear, lookups, context);
  if (namedDate) {
    return namedDate;
  }

  return parseMonthNameDate(compact, anchorYear, Temporal, lookups);
}

function parseMonthNameDate(
  input: string,
  anchorYear: number,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const monthFirst = /^([a-z]+) (\d{1,2})(?: (\d{2,4}))?$/.exec(input);
  if (monthFirst?.[1] && monthFirst[2]) {
    return createMonthNameDate(monthFirst[1], monthFirst[2], monthFirst[3], anchorYear, Temporal, lookups);
  }

  const dayFirst = /^(\d{1,2}) ([a-z]+)(?: (\d{2,4}))?$/.exec(input);
  if (dayFirst?.[1] && dayFirst[2]) {
    return createMonthNameDate(dayFirst[2], dayFirst[1], dayFirst[3], anchorYear, Temporal, lookups);
  }

  return null;
}

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

// Resolves caller-provided named-date vocabulary, including explicit and relative years.
function parseConfiguredNamedDate(
  input: string,
  anchorYear: number,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
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

    return entry.resolveDate({ year, context });
  }

  return null;
}

// Converts relative year words into a concrete calendar year.
function resolveRelativeYear(value: string, anchorYear: number): number {
  if (value === "next") {
    return anchorYear + 1;
  }

  if (value === "last" || value === "previous") {
    return anchorYear - 1;
  }

  return anchorYear;
}
