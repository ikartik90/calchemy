import { resolveBoundary } from "./boundary";
import { expandValueDates } from "./sampler";
import { comparePlainDate } from "../primitives/shared";
import type { ExclusionSlice } from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `applyExclusions(range, [{ kind: "weekends" }], anchor, Temporal, context, lookups)` removes weekend dates.
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

  const predicates = exclusions.map((exclusion) => createExclusionPredicate(exclusion, anchorDate, Temporal, context, lookups));
  if (predicates.some((predicate) => !predicate)) {
    return null;
  }

  const dates = expandValueDates(value).filter((date) => !predicates.some((predicate) => predicate?.(date)));
  return { kind: "multiple", dates };
}

// Example: `createExclusionPredicate({ kind: "holidays" }, anchor, Temporal, context, lookups)` checks configured holidays.
function createExclusionPredicate(
  exclusion: ExclusionSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): ((date: PlainDate) => boolean) | null {
  switch (exclusion.kind) {
    case "boundary": {
      const value = resolveBoundary(exclusion.boundary, anchorDate, Temporal, context, lookups);
      return value ? createDateValuePredicate(value) : null;
    }
    case "holidays":
      return (date) => context.holidays?.includes(date) ?? false;
    case "months":
      return (date) => exclusion.months.includes(date.month);
    case "weekdays":
      return (date) => date.dayOfWeek >= 1 && date.dayOfWeek <= 5;
    case "weekends":
      return (date) => date.dayOfWeek === 6 || date.dayOfWeek === 7;
    case "years":
      return (date) => exclusion.years.includes(date.year);
  }
}

// Example: `createDateValuePredicate(christmasValue)` matches a single resolved date or range.
function createDateValuePredicate(value: DateValue): (date: PlainDate) => boolean {
  if (value.kind === "single") {
    return (date) => date.equals(value.date);
  }

  if (value.kind === "range") {
    return (date) => comparePlainDate(date, value.start) >= 0 && comparePlainDate(date, value.end) <= 0;
  }

  return (date) => value.dates.some((excludedDate) => excludedDate.equals(date));
}
