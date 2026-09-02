import {
  endOfCalendarWeek,
  expandTwoDigitYear,
  firstWeekdayAfter,
  firstWeekdayBefore,
  firstWeekdayOnOrAfter,
  startOfCalendarWeek,
} from "../primitives/date-math";
import { resolveMonthDayList, resolveMonthDayRange } from "../primitives/month-day-list";
import { parseNamedDate } from "../primitives/named-date";
import { parseNumericCandidates } from "../primitives/numeric-date";
import { comparePlainDate, expandDatesBetween, toDuration } from "../primitives/shared";
import { applyRelations } from "./relations";
import { resolveExpression } from "./expression";
import { boundaryToExpression, isCompositionalBoundary } from "../expression/from-slice";
import {
  BackwardRelativeModifierSet,
  ForwardRelativeModifierSet,
  type CalendarRangePeriod,
  type DayGroupPeriod,
  type DurationUnit,
} from "../types";
import type {
  BoundaryEndpointSlice,
  BoundarySlice,
  RelativeExpressionSlice,
  RelativeModifier,
  RelativeTargetSlice,
  YearReferenceSlice,
} from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type {
  DateValue,
  ResolvedParseDateContext,
  WeekdayIndex,
} from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type ResolveBoundaryOptions = {
  scope?: { start: PlainDate; end: PlainDate };
};

// Example: `resolveBoundary({ kind: "week-range", week: 52, ... }, anchor, Temporal, context, lookups)` resolves ISO week 52.
export function resolveBoundary(
  boundary: BoundarySlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveBoundaryOptions,
): DateValue | null {
  // A compositional boundary can reach here nested inside a leaf, as in
  // `start of last 2 weeks of next quarter`. Composition is evaluated in one
  // place only — the expression resolver — so lower it and hand it over.
  if (isCompositionalBoundary(boundary)) {
    return resolveExpression(boundaryToExpression(boundary), anchorDate, Temporal, context, lookups, options);
  }

  switch (boundary.kind) {
    case "anchor-until": {
      const end = resolveBoundaryEndpoint(
        boundary.end,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      return end && comparePlainDate(anchorDate, end) <= 0
        ? { kind: "range", start: anchorDate, end }
        : null;
    }
    case "atom":
      return resolveAtomBoundary(
        boundary.input,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "month-day-list":
      return resolveMonthDayList(boundary.month, boundary.days, anchorDate.year, Temporal);
    case "month-day-range":
      return resolveMonthDayRange(
        boundary.month,
        boundary.startDay,
        boundary.endDay,
        anchorDate.year,
        Temporal,
      );
    case "week-of-date": {
      const dateValue = resolveBoundary(
        boundary.anchor,
        anchorDate,
        Temporal,
        context,
        lookups,
        options,
      );
      if (dateValue?.kind !== "single") {
        return null;
      }

      return {
        kind: "range",
        start: startOfCalendarWeek(dateValue.date, context.weekStartsOn),
        end: endOfCalendarWeek(dateValue.date, context.weekStartsOn),
      };
    }
    case "ordinal-unit-from-anchor": {
      const date = resolveBoundaryAsEndpoint(
        boundary.anchor,
        "start",
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      if (!date) {
        return null;
      }

      const target = shiftDateByDuration(date, boundary.ordinal, boundary.unit);
      return resolveCalendarUnitContainingDate(
        target,
        boundary.unit,
        Temporal,
        context,
      );
    }
    case "ordinal-weekday-from-anchor": {
      const anchor = resolveBoundaryAsEndpoint(
        boundary.anchor,
        "start",
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      if (!anchor) {
        return null;
      }

      let date = firstWeekdayOnOrAfter(anchor, boundary.weekday);
      for (let index = 1; index < boundary.ordinal; index += 1) {
        date = date.add({ days: 7 });
      }

      return { kind: "single", date };
    }
    case "boundary-side": {
      const date = resolveBoundaryAsEndpoint(
        boundary.boundary,
        boundary.side,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      return date ? { kind: "single", date } : null;
    }
    case "duration-from-anchor": {
      const start = resolveBoundaryAsEndpoint(
        boundary.anchor,
        "start",
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      return start
        ? {
            kind: "range",
            start,
            end: shiftDateByDuration(start, boundary.amount, boundary.unit),
          }
        : null;
    }
    case "duration-near-boundary": {
      const direction = boundary.direction === "before" || boundary.direction === "preceding" ? -1 : 1;
      const boundarySide = direction < 0 ? "start" : "end";
      const date = resolveBoundaryAsEndpoint(
        boundary.anchor,
        boundarySide,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      return date
        ? {
            kind: "single",
            date: shiftDateByDuration(date, boundary.amount * direction, boundary.unit),
          }
        : null;
    }
    case "month-range":
      return options?.scope && boundary.year.kind === "anchor"
        ? resolveMonthInScope(boundary.month, options.scope)
        : resolveMonthRange(
            boundary.month,
            resolveYearReference(boundary.year, anchorDate.year),
            Temporal,
          );
    case "named-month-range":
      return options?.scope
        ? resolveMonthInScope(boundary.month, options.scope)
        : resolveMonthRange(boundary.month, anchorDate.year, Temporal);
    case "quarter-range":
      return resolveQuarterRange(
        boundary.quarter,
        resolveYearReference(boundary.year, anchorDate.year),
        Temporal,
      );
    case "range": {
      const start = resolveBoundaryEndpoint(
        boundary.start,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
      const end = start
        ? resolveRangeEndEndpoint(
            boundary.end,
            start,
            anchorDate,
            Temporal,
            context,
            lookups,
          )
        : null;
      return start && end && comparePlainDate(start, end) <= 0
        ? { kind: "range", start, end }
        : null;
    }
    case "relative":
      return resolveRelativeExpression(
        boundary.expression,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "relative-month":
      return resolveMonthRange(
        boundary.month,
        resolveRelativeMonthYear(boundary.modifier, boundary.month, anchorDate),
        Temporal,
      );
    case "relative-quarter-range":
      return resolveRelativeQuarterRange(
        boundary.modifier,
        anchorDate,
        Temporal,
      );
    case "shifted-anchor":
      return resolveShiftedAnchorBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "shorthand-range-list":
      return resolveShorthandRangeListBoundary(boundary, anchorDate, Temporal);
    case "week-range":
      return resolveWeekRange(
        boundary.week,
        resolveYearReference(boundary.year, anchorDate.year),
        Temporal,
      );
    case "year-range":
      return resolveYearRange(boundary.year, Temporal);
    case "holidays":
      return resolveHolidaysBoundary(options?.scope, context, anchorDate, Temporal);
    case "day-group-filter":
      return resolveDayGroupFilterBoundary(boundary.group, anchorDate, context, options?.scope);
    case "date-list":
      return resolveDateListBoundary(boundary, anchorDate, Temporal, context, lookups, options);
  }
}

// Example: `resolveDateListBoundary({ items: [today, tomorrow] }, anchor, Temporal, context, lookups)` returns both dates.
function resolveDateListBoundary(
  boundary: Extract<BoundarySlice, { kind: "date-list" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveBoundaryOptions,
): DateValue | null {
  const dates: PlainDate[] = [];

  for (const item of boundary.items) {
    const value = resolveBoundary(item, anchorDate, Temporal, context, lookups, options);
    if (!value) {
      return null;
    }

    if (value.kind === "single") {
      dates.push(value.date);
      continue;
    }

    if (value.kind === "range") {
      dates.push(...expandDatesBetween(value.start, value.end));
      continue;
    }

    if (value.kind === "multiple") {
      dates.push(...value.dates);
      continue;
    }

    return null;
  }

  const uniqueDates = Array.from(new Map(dates.map((date) => [date.toString(), date])).values()).sort(comparePlainDate);
  return uniqueDates.length > 0 ? { kind: "multiple", dates: uniqueDates } : null;
}

// Example: `resolveAtomBoundary("christmas this year", anchor, Temporal, context, lookups)` resolves a named date atom.
function resolveAtomBoundary(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const bareAnchor = resolveBareDateAnchor(input, anchorDate);
  if (bareAnchor) {
    return { kind: "single", date: bareAnchor };
  }

  const namedDate = parseNamedDate(
    input,
    anchorDate.year,
    Temporal,
    lookups,
    context,
  );
  if (namedDate) {
    return { kind: "single", date: namedDate };
  }

  const numericCandidates = parseNumericCandidates(input, context, Temporal, {
    normalizedInput: input,
    tokens: [],
    corrections: [],
  });
  return numericCandidates[0]?.value ?? null;
}

// Example: `resolveBareDateAnchor("tomorrow", anchor)` returns the next calendar date.
function resolveBareDateAnchor(
  input: string,
  anchorDate: PlainDate,
): PlainDate | null {
  switch (input) {
    case "now":
    case "today":
      return anchorDate;
    case "tomorrow":
      return anchorDate.add({ days: 1 });
    case "yesterday":
      return anchorDate.subtract({ days: 1 });
    default:
      return null;
  }
}

// Example: `resolveBoundaryEndpoint(endpoint, anchor, Temporal, context, lookups)` materializes a start or end date.
function resolveBoundaryEndpoint(
  endpoint: BoundaryEndpointSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  if (endpoint.kind === "relation") {
    const value = resolveBoundary(
      endpoint.boundary,
      anchorDate,
      Temporal,
      context,
      lookups,
    );
    const related = value ? applyRelations(value, endpoint.relation) : null;
    return related?.kind === "single" ? related.date : null;
  }

  return resolveBoundaryAsEndpoint(
    endpoint.boundary,
    endpoint.side,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
}

// Example: `resolveRangeEndEndpoint(endOfMarch, MayStart, anchor, ...)` resolves the written endpoint as-is.
function resolveRangeEndEndpoint(
  endpoint: BoundaryEndpointSlice,
  start: PlainDate,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const end = resolveBoundaryEndpoint(
    endpoint,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (!end || comparePlainDate(start, end) <= 0) {
    return end;
  }

  return null;
}

// Example: `resolveBoundaryAsEndpoint(monthBoundary, "end", anchor, Temporal, context, lookups)` returns the month end.
function resolveBoundaryAsEndpoint(
  boundary: BoundarySlice,
  side: "end" | "start",
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): PlainDate | null {
  const value = resolveBoundary(
    boundary,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (value?.kind === "single") {
    return value.date;
  }

  if (value?.kind === "range") {
    return side === "start" ? value.start : value.end;
  }

  return value?.kind === "multiple"
    ? side === "start"
      ? (value.dates[0] ?? null)
      : (value.dates.at(-1) ?? null)
    : null;
}

// Example: `resolveYearReference({ kind: "relative", value: "next" }, 2026)` returns `2027`.
function resolveYearReference(
  year: YearReferenceSlice,
  anchorYear: number,
): number {
  if (year.kind === "explicit") {
    return expandTwoDigitYear(year.year, anchorYear);
  }

  if (year.kind === "relative") {
    return year.value === "next"
      ? anchorYear + 1
      : year.value === "last" || year.value === "previous"
        ? anchorYear - 1
        : anchorYear;
  }

  return anchorYear;
}

// Example: `resolveMonthInScope(4, scope)` returns every April date inside a scoped range.
function resolveMonthInScope(month: number, scope: { start: PlainDate; end: PlainDate }): DateValue {
  return {
    kind: "multiple",
    dates: expandDatesBetween(scope.start, scope.end).filter((date) => date.month === month),
  };
}

// Example: `resolveMonthRange(3, 2027, Temporal)` returns March 2027.
function resolveMonthRange(
  month: number,
  year: number,
  Temporal: TemporalApi,
): DateValue {
  const start = Temporal.PlainDate.from({ year, month, day: 1 });
  return { kind: "range", start, end: endOfCalendarMonth(start) };
}

// Example: `resolveQuarterRange(4, 2027, Temporal)` returns Q4 2027.
function resolveQuarterRange(
  quarter: number,
  year: number,
  Temporal: TemporalApi,
): DateValue | null {
  if (quarter < 1 || quarter > 4) {
    return null;
  }

  const start = Temporal.PlainDate.from({
    year,
    month: (quarter - 1) * 3 + 1,
    day: 1,
  });
  return {
    kind: "range",
    start,
    end: endOfCalendarMonth(start.add({ months: 2 })),
  };
}

// Example: `resolveRelativeQuarterRange("next", anchor, Temporal)` returns the quarter after the anchor quarter.
function resolveRelativeQuarterRange(
  modifier: RelativeModifier,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
): DateValue {
  const currentQuarter = Math.floor((anchorDate.month - 1) / 3) + 1;
  const quarterOffset =
    modifier === "this" ? 0 : isForwardModifier(modifier) ? 1 : -1;
  const quarterIndex = currentQuarter - 1 + quarterOffset;
  const year = anchorDate.year + Math.floor(quarterIndex / 4);
  const zeroBasedQuarter = ((quarterIndex % 4) + 4) % 4;
  const start = Temporal.PlainDate.from({
    year,
    month: zeroBasedQuarter * 3 + 1,
    day: 1,
  });
  return {
    kind: "range",
    start,
    end: endOfCalendarMonth(start.add({ months: 2 })),
  };
}

// Example: `resolveWeekRange(52, 2027, Temporal)` returns ISO week 52.
function resolveWeekRange(
  week: number,
  year: number,
  Temporal: TemporalApi,
): DateValue | null {
  if (week < 1) {
    return null;
  }

  const weekOneStart = startOfCalendarWeek(
    Temporal.PlainDate.from({ year, month: 1, day: 4 }),
    1,
  );
  const start = weekOneStart.add({ weeks: week - 1 });
  return { kind: "range", start, end: start.add({ days: 6 }) };
}

// Example: `resolveRelativeExpression({ kind: "bare", value: "today" }, anchor, ...)` returns the anchor date.
function resolveRelativeExpression(
  expression: RelativeExpressionSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  if (expression.kind === "bare") {
    return {
      kind: "single",
      date: resolveBareDateAnchor(expression.value, anchorDate) ?? anchorDate,
    };
  }

  if (expression.kind === "from-now") {
    return {
      kind: "single",
      date: shiftDateByDuration(anchorDate, expression.amount, expression.unit),
    };
  }

  return resolveRelativeModifierExpression(
    expression.modifier,
    expression.target,
    anchorDate,
    Temporal,
    context,
  );
}


// Example: `resolveRelativeModifierExpression("next", { kind: "calendar-unit", unit: "month" }, anchor, context)` returns next month.
function resolveRelativeModifierExpression(
  modifier: RelativeModifier,
  target: RelativeTargetSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
): DateValue | null {
  switch (target.kind) {
    case "calendar-unit":
      return resolveCalendarUnitRange(
        modifier,
        target.unit,
        anchorDate,
        Temporal,
        context,
      );
    case "counted-duration":
      return modifier === "this"
        ? null
        : resolveDurationRange(
            modifier,
            target.count,
            target.unit,
            anchorDate,
            context,
          );
    case "counted-weekday":
      return modifier === "this"
        ? null
        : {
            kind: "multiple",
            dates: resolveCountedWeekdays(
              modifier,
              target.count,
              target.weekday,
              anchorDate,
            ),
          };
    case "day-group":
      return resolveDayGroupRange(modifier, target.group, anchorDate, context);
    case "weekday":
      return {
        kind: "single",
        date: resolveRelativeWeekday(modifier, target.weekday, anchorDate),
      };
  }

  return null;
}

// Example: `resolveDurationRange("past", 10, "day", anchor, context)` returns the previous ten-day window.
function resolveDurationRange(
  modifier: RelativeModifier,
  count: number,
  unit: DurationUnit,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
): DateValue | null {
  if (isBackwardModifier(modifier)) {
    const end = anchorDate;
    if (unit === "day") {
      const offset = context.lastNDaysIncludesToday
        ? Math.max(count - 1, 0)
        : count;
      return { kind: "range", start: end.subtract({ days: offset }), end };
    }

    const start = context.lastNDaysIncludesToday
      ? end.subtract(toDuration(count, unit)).add({ days: 1 })
      : end.subtract(toDuration(count, unit));
    return { kind: "range", start, end };
  }

  if (isForwardModifier(modifier)) {
    const start = anchorDate;
    const end =
      unit === "day"
        ? start.add({ days: Math.max(count - 1, 0) })
        : start.add(toDuration(count, unit)).subtract({ days: 1 });
    return { kind: "range", start, end };
  }

  return null;
}

// Example: `shiftDateByDuration(anchor, 3, "weekdays")` skips weekend days.
function shiftDateByDuration(
  date: PlainDate,
  amount: number,
  unit: DurationUnit,
): PlainDate {
  if (unit !== "weekdays") {
    return date.add(toDuration(amount, unit));
  }

  let cursor = date;
  let remaining = amount;
  const step = amount < 0 ? -1 : 1;
  while (remaining !== 0) {
    cursor = cursor.add({ days: step });
    if (cursor.dayOfWeek >= 1 && cursor.dayOfWeek <= 5) {
      remaining -= step;
    }
  }
  return cursor;
}

// Example: `resolveCalendarUnitContainingDate(2026-08-12, "week", Temporal, context)` returns that calendar week.
function resolveCalendarUnitContainingDate(
  date: PlainDate,
  unit: DurationUnit,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
): DateValue | null {
  return resolveCalendarUnitValue(date, unit, context, (resolvedDate) => {
    const quarter = Math.floor((resolvedDate.month - 1) / 3) + 1;
    return resolveQuarterRange(quarter, resolvedDate.year, Temporal);
  });
}

// Example: `resolveCalendarUnitRange("this", "week", anchor, context)` returns the current configured week.
function resolveCalendarUnitRange(
  modifier: RelativeModifier,
  unit: DurationUnit,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
): DateValue | null {
  const offset = modifier === "this" ? 0 : isForwardModifier(modifier) ? 1 : -1;
  const date = anchorDate.add(toDuration(offset, unit));
  const resolved = resolveCalendarUnitValue(date, unit, context, () =>
    resolveRelativeQuarterRange(modifier, anchorDate, Temporal),
  );

  return (
    resolved ?? {
      kind: "range",
      start: startOfCalendarYear(date),
      end: endOfCalendarYear(date),
    }
  );
}

// Example: `resolveRelativeWeekday("next", 5, anchor)` returns next Friday.
function resolveRelativeWeekday(
  modifier: RelativeModifier,
  weekday: number,
  anchorDate: PlainDate,
): PlainDate {
  if (modifier === "this" || modifier === "upcoming" || modifier === "future") {
    return firstWeekdayOnOrAfter(anchorDate, weekday);
  }

  if (modifier === "next") {
    return firstWeekdayAfter(
      firstWeekdayOnOrAfter(anchorDate, weekday),
      weekday,
    );
  }

  return firstWeekdayBefore(anchorDate, weekday);
}

// Example: `resolveCountedWeekdays("next", 3, 5, anchor)` returns the next three Fridays.
function resolveCountedWeekdays(
  modifier: RelativeModifier,
  count: number,
  weekday: number,
  anchorDate: PlainDate,
): PlainDate[] {
  const dates: PlainDate[] = [];
  const isBackward = isBackwardModifier(modifier);
  let cursor = isBackward
    ? firstWeekdayBefore(
        modifier === "past" ? anchorDate.add({ days: 1 }) : anchorDate,
        weekday,
      )
    : firstWeekdayOnOrAfter(anchorDate, weekday);

  while (dates.length < count) {
    dates.push(cursor);
    cursor = isBackward
      ? cursor.subtract({ days: 7 })
      : cursor.add({ days: 7 });
  }

  return dates;
}

// Example: `resolveDayGroupRange("next", "weekend", anchor, context)` returns next weekend.
function resolveDayGroupRange(
  modifier: RelativeModifier,
  group: DayGroupPeriod,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
): DateValue {
  const offset =
    modifier === "next" ? 1 : isBackwardModifier(modifier) ? -1 : 0;
  const weekStart = startOfCalendarWeek(
    anchorDate.add({ weeks: offset }),
    context.weekStartsOn,
  );
  const start =
    group === "weekdays"
      ? firstWeekdayOnOrAfter(weekStart, 1)
      : firstWeekdayOnOrAfter(weekStart, 6);
  const end =
    group === "weekdays"
      ? firstWeekdayOnOrAfter(start, 5)
      : firstWeekdayOnOrAfter(start, 7);
  return { kind: "range", start, end };
}

// Example: `resolveDayGroupFilterBoundary("weekend", anchor, context, scope)` returns weekend dates inside a scope.
function resolveDayGroupFilterBoundary(
  group: DayGroupPeriod,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  scope?: { start: PlainDate; end: PlainDate },
): DateValue {
  if (scope) {
    return {
      kind: "multiple",
      dates: expandDatesBetween(scope.start, scope.end).filter((date) => matchesDayGroup(date, group)),
    };
  }

  return resolveDayGroupRange("this", group, anchorDate, context);
}

// Example: `resolveHolidaysBoundary(scope, context, anchor, Temporal)` returns configured holidays inside a scope.
function resolveHolidaysBoundary(
  scope: { start: PlainDate; end: PlainDate } | undefined,
  context: ResolvedParseDateContext,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
): DateValue {
  if (!context.holidays) {
    return { kind: "multiple", dates: [] };
  }

  const resolvedScope =
    scope ??
    ({
      start: Temporal.PlainDate.from({ year: anchorDate.year, month: 1, day: 1 }),
      end: Temporal.PlainDate.from({ year: anchorDate.year, month: 12, day: 31 }),
    } satisfies { start: PlainDate; end: PlainDate });

  return {
    kind: "multiple",
    dates: expandDatesBetween(resolvedScope.start, resolvedScope.end).filter((date) => context.holidays?.includes(date)),
  };
}

// Example: `resolveYearRange(2027, Temporal)` returns the full 2027 calendar year.
function resolveYearRange(year: number, Temporal: TemporalApi): DateValue {
  return {
    kind: "range",
    start: Temporal.PlainDate.from({ year, month: 1, day: 1 }),
    end: Temporal.PlainDate.from({ year, month: 12, day: 31 }),
  };
}

// Example: `matchesDayGroup(date, "weekend")` returns true for Saturday and Sunday.
function matchesDayGroup(date: PlainDate, group: DayGroupPeriod): boolean {
  return group === "weekend"
    ? date.dayOfWeek === 6 || date.dayOfWeek === 7
    : date.dayOfWeek >= 1 && date.dayOfWeek <= 5;
}















// Example: `resolveShiftedAnchorBoundary(tomorrowNextMonthBoundary, anchor, Temporal, context, lookups)` projects tomorrow into next month.
function resolveShiftedAnchorBoundary(
  boundary: Extract<BoundarySlice, { kind: "shifted-anchor" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const source = resolveBoundary(
    boundary.anchor,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (source?.kind !== "single" || range?.kind !== "range") {
    return null;
  }

  const date = projectDateIntoRange(source.date, range, boundary.unit);
  return date ? { kind: "single", date } : null;
}




// Example: `resolveShorthandRangeListBoundary(w51AndW52Boundary, anchor, Temporal)` expands selected shorthand ranges into dates.
function resolveShorthandRangeListBoundary(
  boundary: Extract<BoundarySlice, { kind: "shorthand-range-list" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
): DateValue | null {
  const year = resolveYearReference(boundary.year, anchorDate.year);
  const ranges = boundary.ordinals.map((ordinal) =>
    boundary.unit === "week"
      ? resolveWeekRange(ordinal, year, Temporal)
      : resolveMonthRange(ordinal, year, Temporal),
  );
  if (ranges.some((range) => range?.kind !== "range")) {
    return null;
  }

  return {
    kind: "multiple",
    dates: (ranges as Array<Extract<DateValue, { kind: "range" }>>).flatMap(
      (range) => expandDatesBetween(range.start, range.end),
    ),
  };
}

// Example: `resolveRelativeMonthYear("next", 3, anchor)` returns the next occurrence of March.
function resolveRelativeMonthYear(
  modifier: RelativeModifier,
  month: number,
  anchorDate: PlainDate,
): number {
  if (isForwardModifier(modifier)) {
    return month > anchorDate.month ? anchorDate.year : anchorDate.year + 1;
  }

  if (isBackwardModifier(modifier)) {
    return month < anchorDate.month ? anchorDate.year : anchorDate.year - 1;
  }

  return anchorDate.year;
}

// Example: `projectDateIntoRange(sourceDate, monthRange, "month")` preserves day position inside a range.
function projectDateIntoRange(
  source: PlainDate,
  range: Extract<DateValue, { kind: "range" }>,
  unit: CalendarRangePeriod,
): PlainDate | null {
  if (unit === "week") {
    const date = firstWeekdayOnOrAfter(range.start, source.dayOfWeek);
    return comparePlainDate(date, range.end) <= 0 ? date : null;
  }

  if (unit === "month" || unit === "quarter") {
    return createDateInRange(
      range.start,
      range.end,
      range.start.month,
      source.day,
    );
  }

  return createDateInRange(range.start, range.end, source.month, source.day);
}

// Example: `createDateInRange(rangeStart, rangeEnd, 2, 31)` clamps to February's last day if needed.
function createDateInRange(
  start: PlainDate,
  end: PlainDate,
  month: number,
  day: number,
): PlainDate | null {
  let cursor = start.with({ month, day: 1 });
  const targetDay = Math.min(day, cursor.daysInMonth);
  cursor = cursor.with({ day: targetDay });
  return comparePlainDate(cursor, start) >= 0 &&
    comparePlainDate(cursor, end) <= 0
    ? cursor
    : null;
}


// Example: `resolveCalendarUnitValue(date, "week", context, resolveQuarter)` returns that calendar week.
function resolveCalendarUnitValue(
  date: PlainDate,
  unit: DurationUnit,
  context: ResolvedParseDateContext,
  resolveQuarter: (date: PlainDate) => DateValue | null,
): DateValue | null {
  if (unit === "day") {
    return { kind: "single", date };
  }

  if (unit === "week") {
    return {
      kind: "range",
      start: startOfCalendarWeek(date, context.weekStartsOn),
      end: endOfCalendarWeek(date, context.weekStartsOn),
    };
  }

  if (unit === "month") {
    return {
      kind: "range",
      start: startOfCalendarMonth(date),
      end: endOfCalendarMonth(date),
    };
  }

  if (unit === "quarter") {
    return resolveQuarter(date);
  }

  if (unit === "year") {
    return {
      kind: "range",
      start: startOfCalendarYear(date),
      end: endOfCalendarYear(date),
    };
  }

  return null;
}









// Example: `startOfCalendarMonth(2026-05-27)` returns `2026-05-01`.
function startOfCalendarMonth(date: PlainDate): PlainDate {
  return date.with({ day: 1 });
}

// Example: `endOfCalendarMonth(2026-05-27)` returns `2026-05-31`.
function endOfCalendarMonth(date: PlainDate): PlainDate {
  return startOfCalendarMonth(date).add({ months: 1 }).subtract({ days: 1 });
}

// Example: `startOfCalendarYear(2026-05-27)` returns `2026-01-01`.
function startOfCalendarYear(date: PlainDate): PlainDate {
  return date.with({ month: 1, day: 1 });
}

// Example: `endOfCalendarYear(2026-05-27)` returns `2026-12-31`.
function endOfCalendarYear(date: PlainDate): PlainDate {
  return startOfCalendarYear(date).add({ years: 1 }).subtract({ days: 1 });
}


// Example: `isBackwardModifier("previous")` returns true.
function isBackwardModifier(modifier: RelativeModifier): boolean {
  return BackwardRelativeModifierSet.has(modifier);
}

// Example: `isForwardModifier("upcoming")` returns true.
function isForwardModifier(modifier: RelativeModifier): boolean {
  return ForwardRelativeModifierSet.has(modifier);
}
