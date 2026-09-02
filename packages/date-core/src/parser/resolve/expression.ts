import {
  firstWeekdayOnOrAfter,
} from "../primitives/date-math";
import { comparePlainDate, expandDatesBetween } from "../primitives/shared";
import { applyRelations } from "./relations";
import { applySampler } from "./sampler";
import { resolveBoundary, type ResolveBoundaryOptions } from "./boundary";
import {
  clipRangeToWindow,
  enumerateEachUnitPeriodRanges,
  materializeSelectedRanges,
  selectEdgeCountUnits,
  selectOrdinalCalendarUnitRange,
} from "./periods";
import type { DateExpression, IterateOperator, SelectOperator } from "../expression/types";
import type { RangeHalf } from "../slice/types";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type ResolveExpressionOptions = ResolveBoundaryOptions;

type DateRange = Extract<DateValue, { kind: "range" }>;

/**
 * Drops the exclusion scope before descending into a selector's argument.
 *
 * `options.scope` means "this phrase is an exclusion; read a bare period such
 * as `august` or `weekends` as a recurring filter inside the parent window".
 * That reading is right for the leaf an exclusion names directly, and it
 * propagates through wrappers such as sampling. It is wrong for the range a
 * selector picks from: in `except the third week of august`, `august` names
 * the specific range to select a week within, not a filter — and a scoped
 * month resolves to discrete dates, which no selector can pick a week from.
 *
 * Example: `withoutScope({ scope })` returns `{}`.
 */
function withoutScope(options: ResolveExpressionOptions | undefined): ResolveExpressionOptions | undefined {
  if (!options?.scope) {
    return options;
  }

  const { scope: _scope, ...rest } = options;
  return rest;
}

export function resolveExpression(
  expression: DateExpression,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveExpressionOptions,
): DateValue | null {
  switch (expression.kind) {
    case "scope":
      return resolveBoundary(expression.boundary, anchorDate, Temporal, context, lookups, options);
    case "sample": {
      const inner = resolveExpression(expression.inner, anchorDate, Temporal, context, lookups, options);
      return inner ? applySampler(inner, expression.sampler, context.weekStartsOn) : null;
    }
    case "select":
      return resolveSelectExpression(
        expression.select,
        expression.inner,
        anchorDate,
        Temporal,
        context,
        lookups,
        options,
      );
    case "iterate":
      return resolveIterateExpression(
        expression.iterate,
        expression.inner,
        anchorDate,
        Temporal,
        context,
        lookups,
        options,
      );
  }
}

function resolveSelectExpression(
  select: SelectOperator,
  inner: DateExpression,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveExpressionOptions,
): DateValue | null {
  if (inner.kind === "iterate" && inner.iterate.kind === "each-unit") {
    return resolveSelectOverEachUnit(
      select,
      inner.iterate,
      inner.inner,
      anchorDate,
      Temporal,
      context,
      lookups,
      options,
    );
  }

  const resolved = resolveExpression(inner, anchorDate, Temporal, context, lookups, withoutScope(options));
  if (!resolved) {
    return null;
  }

  switch (select.kind) {
    case "near-relation":
      return applyRelations(resolved, select.relation);
    case "weekday-in-period":
      return applyRelations(resolved, {
        kind: "weekday-in-boundary",
        placement: select.placement,
        weekday: select.weekday,
      });
    case "edge-count-unit":
      return resolved.kind === "range"
        ? selectEdgeCountUnits(
            resolved,
            select.edge,
            select.count,
            select.unit,
            context.weekStartsOn,
            Temporal,
            context,
            select.skipHolidays,
          )
        : null;
    case "ordinal-units":
      return resolved.kind === "range"
        ? materializeOrdinalUnitSelections(resolved, select.ordinals, select.unit, context.weekStartsOn)
        : null;
    case "ordinal-units-span":
      return resolved.kind === "range"
        ? materializeOrdinalUnitSpan(
            resolved,
            select.startOrdinal,
            select.endOrdinal,
            select.unit,
            context.weekStartsOn,
          )
        : null;
    case "ordinal-day":
      return resolved.kind === "range" ? resolveOrdinalDayInRange(resolved, select.day) : null;
    case "half":
      return resolved.kind === "range" ? resolveHalfOfRange(resolved, select.half) : null;
    case "unique-weekday":
      return resolved.kind === "range"
        ? resolveUniqueWeekdayInRange(resolved, select.weekday)
        : null;
    case "ordinal-weekday":
      return resolved.kind === "range"
        ? resolveOrdinalWeekdayInRange(resolved, select.ordinal, select.weekday)
        : null;
    case "ordinal-day-group":
      return resolved.kind === "range"
        ? resolveOrdinalDayGroupInRange(resolved, select.ordinal, select.group)
        : null;
  }
}

function resolveIterateExpression(
  iterate: IterateOperator,
  inner: DateExpression,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveExpressionOptions,
): DateValue | null {
  if (iterate.kind === "counted-duration") {
    return resolveExpression(
      {
        kind: "scope",
        boundary: {
          kind: "relative",
          expression: {
            kind: "modifier",
            modifier: iterate.modifier,
            target: {
              kind: "counted-duration",
              count: iterate.count,
              unit: iterate.unit,
            },
          },
        },
      },
      anchorDate,
      Temporal,
      context,
      lookups,
      options,
    );
  }

  // Iterating with nothing to select in each period is just the window
  // itself: `every week in june` is June, which a sampler can then filter.
  return resolveExpression(inner, anchorDate, Temporal, context, lookups, options);
}

function resolveSelectOverEachUnit(
  select: SelectOperator,
  iterate: Extract<IterateOperator, { kind: "each-unit" }>,
  inner: DateExpression,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveExpressionOptions,
): DateValue | null {
  const within = resolveExpression(inner, anchorDate, Temporal, context, lookups, withoutScope(options));
  if (within?.kind !== "range") {
    return null;
  }

  const windowStart =
    comparePlainDate(within.start, anchorDate) < 0 ? anchorDate : within.start;
  const ranges: DateRange[] = [];
  const singles: PlainDate[] = [];

  for (const periodRange of enumerateEachUnitPeriodRanges(
    within,
    iterate.unit,
    context.weekStartsOn,
    Temporal,
  )) {
    const selected = selectInPeriod(select, periodRange, Temporal, context);
    if (!selected) {
      continue;
    }

    if (selected.kind === "single") {
      if (
        comparePlainDate(selected.date, windowStart) >= 0 &&
        comparePlainDate(selected.date, within.end) <= 0
      ) {
        singles.push(selected.date);
      }
      continue;
    }

    if (selected.kind === "range") {
      const clipped = clipRangeToWindow(selected, windowStart, within.end);
      if (clipped) {
        ranges.push(clipped);
      }
    }
  }

  if (ranges.length > 0) {
    const rangeValue = materializeSelectedRanges(ranges);
    if (singles.length === 0) {
      return rangeValue;
    }

    const dates =
      rangeValue?.kind === "multiple"
        ? [...rangeValue.dates, ...singles]
        : rangeValue?.kind === "range"
          ? [...expandDatesBetween(rangeValue.start, rangeValue.end), ...singles]
          : [...singles];
    return dates.length > 0 ? { kind: "multiple", dates } : null;
  }

  return singles.length > 0 ? { kind: "multiple", dates: singles } : null;
}

function selectInPeriod(
  select: SelectOperator,
  periodRange: DateRange,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
): DateValue | null {
  const { weekStartsOn } = context;
  switch (select.kind) {
    case "edge-count-unit":
      return selectEdgeCountUnits(
        periodRange,
        select.edge,
        select.count,
        select.unit,
        weekStartsOn,
        Temporal,
        context,
        select.skipHolidays,
      );
    case "ordinal-units": {
      const selectedRanges = select.ordinals
        .map((ordinal) =>
          selectOrdinalCalendarUnitRange(periodRange, select.unit, ordinal, weekStartsOn),
        )
        .filter((value): value is DateRange => value?.kind === "range");
      return selectedRanges.length > 0 ? materializeSelectedRanges(selectedRanges) : null;
    }
    case "ordinal-units-span":
      return materializeOrdinalUnitSpan(
        periodRange,
        select.startOrdinal,
        select.endOrdinal,
        select.unit,
        weekStartsOn,
      );
    case "ordinal-day":
      return resolveOrdinalDayInRange(periodRange, select.day);
    case "half":
      return resolveHalfOfRange(periodRange, select.half);
    case "unique-weekday":
      return resolveUniqueWeekdayInRange(periodRange, select.weekday);
    case "ordinal-weekday":
      return resolveOrdinalWeekdayInRange(periodRange, select.ordinal, select.weekday);
    case "ordinal-day-group":
      return resolveOrdinalDayGroupInRange(periodRange, select.ordinal, select.group);
    default:
      return null;
  }
}

function materializeOrdinalUnitSelections(
  range: DateRange,
  ordinals: number[],
  unit: Extract<SelectOperator, { kind: "ordinal-units" }>["unit"],
  weekStartsOn: ResolvedParseDateContext["weekStartsOn"],
): DateValue | null {
  const selectedRanges = ordinals
    .map((ordinal) => selectOrdinalCalendarUnitRange(range, unit, ordinal, weekStartsOn))
    .filter((value): value is DateRange => value?.kind === "range");
  if (selectedRanges.length !== ordinals.length) {
    return null;
  }

  return materializeSelectedRanges(selectedRanges);
}

function materializeOrdinalUnitSpan(
  range: DateRange,
  startOrdinal: number,
  endOrdinal: number,
  unit: Extract<SelectOperator, { kind: "ordinal-units-span" }>["unit"],
  weekStartsOn: ResolvedParseDateContext["weekStartsOn"],
): DateValue | null {
  if (startOrdinal > endOrdinal) {
    return null;
  }

  const startRange = selectOrdinalCalendarUnitRange(range, unit, startOrdinal, weekStartsOn);
  const endRange = selectOrdinalCalendarUnitRange(range, unit, endOrdinal, weekStartsOn);
  return startRange?.kind === "range" && endRange?.kind === "range"
    ? { kind: "range", start: startRange.start, end: endRange.end }
    : null;
}

/**
 * Picks a day of the month inside a range: the day belongs to the month the
 * range starts in, and must fall inside the range.
 *
 * Example: `resolveOrdinalDayInRange(june2026, 15)` returns 2026-06-15;
 * `resolveOrdinalDayInRange(february2027, 30)` returns null.
 */
function resolveOrdinalDayInRange(range: DateRange, day: number): DateValue | null {
  let date: PlainDate;
  try {
    date = range.start.with({ day }, { overflow: "reject" });
  } catch {
    return null;
  }

  return comparePlainDate(date, range.start) >= 0 && comparePlainDate(date, range.end) <= 0
    ? { kind: "single", date }
    : null;
}

/**
 * Splits a range in two. A range made of whole months with an even count
 * splits on a month boundary, so the halves of a year are January–June and
 * July–December; anything else splits by day, with the first half taking the
 * smaller share when the count is odd.
 *
 * Example: `resolveHalfOfRange(year2027, "first")` returns 2027-01-01/2027-06-30;
 * `resolveHalfOfRange(june2026, "second")` returns 2026-06-16/2026-06-30.
 */
function resolveHalfOfRange(range: DateRange, half: RangeHalf): DateValue | null {
  const midpoint = halfwayPoint(range);
  if (!midpoint) {
    return null;
  }

  return half === "first"
    ? { kind: "range", start: range.start, end: midpoint.subtract({ days: 1 }) }
    : { kind: "range", start: midpoint, end: range.end };
}

// Example: `halfwayPoint(year2027)` returns 2027-07-01; `halfwayPoint(singleDay)` returns null.
function halfwayPoint(range: DateRange): PlainDate | null {
  const startsOnMonthStart = range.start.day === 1;
  const endsOnMonthEnd = range.end.day === range.end.daysInMonth;
  const monthCount = (range.end.year - range.start.year) * 12 + (range.end.month - range.start.month) + 1;
  if (startsOnMonthStart && endsOnMonthEnd && monthCount >= 2 && monthCount % 2 === 0) {
    return range.start.add({ months: monthCount / 2 });
  }

  const dayCount = range.start.until(range.end, { largestUnit: "day" }).days + 1;
  return dayCount >= 2 ? range.start.add({ days: Math.floor(dayCount / 2) }) : null;
}

function resolveUniqueWeekdayInRange(range: DateRange, weekday: number): DateValue | null {
  const date = firstWeekdayOnOrAfter(range.start, weekday);
  if (
    comparePlainDate(date, range.end) > 0 ||
    comparePlainDate(date.add({ days: 7 }), range.end) <= 0
  ) {
    return null;
  }

  return { kind: "single", date };
}

function resolveOrdinalWeekdayInRange(
  range: DateRange,
  ordinal: number,
  weekday: number,
): DateValue | null {
  let date = firstWeekdayOnOrAfter(range.start, weekday);
  for (let index = 1; index < ordinal; index += 1) {
    date = date.add({ weeks: 1 });
  }

  return comparePlainDate(date, range.end) <= 0 ? { kind: "single", date } : null;
}

function resolveOrdinalDayGroupInRange(
  range: DateRange,
  ordinal: number,
  group: Extract<SelectOperator, { kind: "ordinal-day-group" }>["group"],
): DateValue | null {
  const dates = expandWeekdaysBetween(
    range.start,
    range.end,
    group === "weekend" ? [6, 7] : [1, 2, 3, 4, 5],
  );
  const groupSize = group === "weekend" ? 2 : 5;
  const groupStartIndex = (ordinal - 1) * groupSize;
  const selectedDates = dates.slice(groupStartIndex, groupStartIndex + groupSize);
  return selectedDates.length === groupSize
    ? {
        kind: "range",
        start: selectedDates[0] as PlainDate,
        end: selectedDates[selectedDates.length - 1] as PlainDate,
      }
    : null;
}

function expandWeekdaysBetween(
  start: PlainDate,
  end: PlainDate,
  weekdays: readonly number[],
): PlainDate[] {
  return expandDatesBetween(start, end).filter((date) => weekdays.includes(date.dayOfWeek));
}
