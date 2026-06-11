import { startOfCalendarWeek } from "../primitives/date-math";
import { materializeDateValue } from "./materialize";
import { resolveDateSliceWithoutExclusions } from "./slice";
import { expandValueDates } from "./sampler";
import { comparePlainDate } from "../primitives/shared";
import type { DateSlice, SamplerSlice } from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type ApplyExclusionsOptions = {
  sampler?: SamplerSlice | null;
};

// Example: `applyExclusions(range, [weekendSlice], anchor, Temporal, context, lookups)` removes resolved exclusion dates.
export function applyExclusions(
  value: DateValue,
  exclusions: readonly DateSlice[],
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options: ApplyExclusionsOptions = {},
): DateValue | null {
  if (exclusions.length === 0) {
    return value;
  }

  const scope = getValueDateScope(value);
  if (!scope) {
    return null;
  }

  const predicates = exclusions.map((exclusion) =>
    createExclusionPredicate(exclusion, scope, anchorDate, Temporal, context, lookups, options),
  );
  if (predicates.some((predicate) => !predicate)) {
    return null;
  }

  const dates = expandValueDates(value).filter((date) => !predicates.some((predicate) => predicate?.(date)));
  return { kind: "multiple", dates };
}

// Example: `createExclusionPredicate(weekendSlice, scope, anchor, Temporal, context, lookups)` checks resolved exclusion dates.
function createExclusionPredicate(
  exclusion: DateSlice,
  scope: { start: PlainDate; end: PlainDate },
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options: ApplyExclusionsOptions,
): ((date: PlainDate) => boolean) | null {
  const transformed = resolveDateSliceWithoutExclusions(
    exclusion,
    anchorDate,
    Temporal,
    context,
    lookups,
    { scope },
  );
  if (!transformed) {
    return null;
  }

  const filtered = applyExclusions(
    transformed,
    exclusion.exclusions,
    anchorDate,
    Temporal,
    context,
    lookups,
    { sampler: exclusion.sampler },
  );
  const value = filtered ? materializeDateValue(filtered) : null;
  return value
    ? createDateValuePredicate(value, options.sampler, context.weekStartsOn)
    : null;
}

// Example: `createDateValuePredicate(christmasValue)` matches a single resolved date or range.
function createDateValuePredicate(
  value: DateValue,
  sampler: SamplerSlice | null | undefined,
  weekStartsOn: ResolvedParseDateContext["weekStartsOn"],
): (date: PlainDate) => boolean {
  if (sampler?.kind === "weeks" && value.kind === "range") {
    return createCalendarWeekRangePredicate(value.start, value.end, weekStartsOn);
  }

  if (value.kind === "single") {
    return (date) => date.equals(value.date);
  }

  if (value.kind === "range") {
    return (date) => comparePlainDate(date, value.start) >= 0 && comparePlainDate(date, value.end) <= 0;
  }

  return (date) => value.dates.some((excludedDate) => excludedDate.equals(date));
}

// Example: `createCalendarWeekRangePredicate("2026-08-15", "2026-08-21", 0)` excludes every date in overlapping calendar weeks.
function createCalendarWeekRangePredicate(
  start: PlainDate,
  end: PlainDate,
  weekStartsOn: ResolvedParseDateContext["weekStartsOn"],
): (date: PlainDate) => boolean {
  const excludedWeekStarts = new Set<string>();
  let weekStart = startOfCalendarWeek(start, weekStartsOn);
  const lastWeekStart = startOfCalendarWeek(end, weekStartsOn);

  while (comparePlainDate(weekStart, lastWeekStart) <= 0) {
    excludedWeekStarts.add(weekStart.toString());
    weekStart = weekStart.add({ weeks: 1 });
  }

  return (date) => excludedWeekStarts.has(startOfCalendarWeek(date, weekStartsOn).toString());
}

// Example: `getValueDateScope({ kind: "range", start, end })` returns the inclusive bounds of a value.
function getValueDateScope(value: DateValue): { start: PlainDate; end: PlainDate } | null {
  if (value.kind === "single") {
    return { start: value.date, end: value.date };
  }

  if (value.kind === "range") {
    return { start: value.start, end: value.end };
  }

  if (value.dates.length === 0) {
    return null;
  }

  const sorted = [...value.dates].sort(comparePlainDate);
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! };
}
