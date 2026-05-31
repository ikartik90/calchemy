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

  const monthMatch = /^([a-z]+) (\d{1,2})(?: (\d{2,4}))?$/.exec(compact);
  if (monthMatch?.[1] && monthMatch[2]) {
    const month = lookups.months.get(monthMatch[1]);
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? expandTwoDigitYear(Number(monthMatch[3]), anchorYear) : anchorYear;

    if (!month) {
      return null;
    }

    try {
      return Temporal.PlainDate.from({ year, month, day });
    } catch {
      return null;
    }
  }

  return null;
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
