import {
  expandTwoDigitYear,
  firstWeekdayAfter,
  firstWeekdayBefore,
  firstWeekdayOnOrAfter,
} from "../primitives/date-math";
import { parseNamedDate } from "../primitives/named-date";
import { parseNumericCandidates } from "../primitives/numeric-date";
import { comparePlainDate, toDuration } from "../primitives/shared";
import { applyRelations } from "./relations";
import {
  BackwardRelativeModifierSet,
  ForwardRelativeModifierSet,
  type CalendarListPeriod,
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

// Example: `resolveBoundary({ kind: "week-range", week: 52, ... }, anchor, Temporal, context, lookups)` resolves ISO week 52.
export function resolveBoundary(
  boundary: BoundarySlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
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
      return resolveMonthRange(
        boundary.month,
        resolveYearReference(boundary.year, anchorDate.year),
        Temporal,
      );
    case "named-month-range":
      return resolveMonthRange(boundary.month, anchorDate.year, Temporal);
    case "ordinal-calendar-unit":
      return resolveOrdinalCalendarUnitBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "ordinal-calendar-unit-span":
      return resolveOrdinalCalendarUnitSpanBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "ordinal-day-group-in-range":
      return resolveOrdinalDayGroupBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "ordinal-weekday-in-range":
      return resolveOrdinalWeekdayBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
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
    case "unique-weekday-in-range":
      return resolveUniqueWeekdayBoundary(
        boundary,
        anchorDate,
        Temporal,
        context,
        lookups,
      );
    case "week-range":
      return resolveWeekRange(
        boundary.week,
        resolveYearReference(boundary.year, anchorDate.year),
        Temporal,
      );
  }
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

  if (expression.kind === "leading-trailing-days") {
    return resolveLeadingOrTrailingDays(
      expression,
      anchorDate,
      Temporal,
      context,
      lookups,
    );
  }

  return resolveRelativeModifierExpression(
    expression.modifier,
    expression.target,
    anchorDate,
    Temporal,
    context,
  );
}

// Example: `resolveLeadingOrTrailingDays(firstTenDays, anchor, Temporal, context, lookups)` returns a range subset.
function resolveLeadingOrTrailingDays(
  expression: Extract<
    RelativeExpressionSlice,
    { kind: "leading-trailing-days" }
  >,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    expression.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range") {
    return null;
  }

  const date = expression.edge === "first" ? range.start : range.end;
  if (expression.count === 1) {
    return expression.skipHolidays && context.holidays?.includes(date)
      ? { kind: "multiple", dates: [] }
      : { kind: "single", date };
  }

  const value =
    expression.edge === "first"
      ? {
          kind: "range" as const,
          start: range.start,
          end: range.start.add({ days: expression.count - 1 }),
        }
      : {
          kind: "range" as const,
          start: range.end.subtract({ days: expression.count - 1 }),
          end: range.end,
        };

  return comparePlainDate(value.start, range.start) >= 0 &&
    comparePlainDate(value.end, range.end) <= 0
    ? applyHolidayExclusion(value, expression.skipHolidays, context)
    : null;
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
    return resolveRelativeQuarterRange(modifier, anchorDate, Temporal);
  }

  return {
    kind: "range",
    start: startOfCalendarYear(date),
    end: endOfCalendarYear(date),
  };
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

// Example: `resolveOrdinalCalendarUnitSpanBoundary(spanBoundary, anchor, Temporal, context, lookups)` returns a continuous week or month span.
function resolveOrdinalCalendarUnitSpanBoundary(
  boundary: Extract<BoundarySlice, { kind: "ordinal-calendar-unit-span" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range" || boundary.startOrdinal > boundary.endOrdinal) {
    return null;
  }

  const startRange = selectOrdinalCalendarUnitRange(
    range,
    boundary.unit,
    boundary.startOrdinal,
  );
  const endRange = selectOrdinalCalendarUnitRange(
    range,
    boundary.unit,
    boundary.endOrdinal,
  );
  return startRange?.kind === "range" && endRange?.kind === "range"
    ? { kind: "range", start: startRange.start, end: endRange.end }
    : null;
}

// Example: `resolveOrdinalCalendarUnitBoundary(weekListBoundary, anchor, Temporal, context, lookups)` resolves selected ordinal weeks.
function resolveOrdinalCalendarUnitBoundary(
  boundary: Extract<BoundarySlice, { kind: "ordinal-calendar-unit" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range") {
    return null;
  }

  const selectedRanges = boundary.ordinals
    .map((ordinal) =>
      selectOrdinalCalendarUnitRange(range, boundary.unit, ordinal),
    )
    .filter(
      (value): value is Extract<DateValue, { kind: "range" }> =>
        value?.kind === "range",
    );
  if (selectedRanges.length !== boundary.ordinals.length) {
    return null;
  }

  if (areContiguousRanges(selectedRanges)) {
    const firstRange = selectedRanges[0];
    const lastRange = selectedRanges.at(-1);
    return firstRange && lastRange
      ? { kind: "range", start: firstRange.start, end: lastRange.end }
      : null;
  }

  const dates = selectedRanges.flatMap((selectedRange) =>
    expandDatesBetween(selectedRange.start, selectedRange.end),
  );
  return dates.length > 0 ? { kind: "multiple", dates } : null;
}

// Example: `selectOrdinalCalendarUnitRange(yearRange, "week", 52)` selects the 52nd week inside the year.
function selectOrdinalCalendarUnitRange(
  range: Extract<DateValue, { kind: "range" }>,
  unit: CalendarListPeriod,
  ordinal: number,
): DateValue | null {
  const start =
    unit === "week"
      ? range.start.add({ weeks: ordinal - 1 })
      : range.start.add({ months: ordinal - 1 });
  const end =
    unit === "week"
      ? start.add({ days: 6 })
      : start.add({ months: 1 }).subtract({ days: 1 });
  if (comparePlainDate(start, range.end) > 0) {
    return null;
  }

  return {
    kind: "range",
    start,
    end: comparePlainDate(end, range.end) <= 0 ? end : range.end,
  };
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

// Example: `resolveOrdinalWeekdayBoundary(firstSundayBoundary, anchor, Temporal, context, lookups)` resolves the first Sunday in a range.
function resolveOrdinalWeekdayBoundary(
  boundary: Extract<BoundarySlice, { kind: "ordinal-weekday-in-range" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range") {
    return null;
  }

  const date = firstWeekdayOnOrAfter(range.start, boundary.weekday).add({
    weeks: boundary.ordinal - 1,
  });
  return comparePlainDate(date, range.end) <= 0
    ? { kind: "single", date }
    : null;
}

// Example: `resolveUniqueWeekdayBoundary(sundayOfNextWeekBoundary, anchor, Temporal, context, lookups)` resolves a single weekday only when unique.
function resolveUniqueWeekdayBoundary(
  boundary: Extract<BoundarySlice, { kind: "unique-weekday-in-range" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range") {
    return null;
  }

  const date = firstWeekdayOnOrAfter(range.start, boundary.weekday);
  if (
    comparePlainDate(date, range.end) > 0 ||
    comparePlainDate(date.add({ days: 7 }), range.end) <= 0
  ) {
    return null;
  }

  return { kind: "single", date };
}

// Example: `resolveOrdinalDayGroupBoundary(secondWeekendBoundary, anchor, Temporal, context, lookups)` resolves the selected weekend.
function resolveOrdinalDayGroupBoundary(
  boundary: Extract<BoundarySlice, { kind: "ordinal-day-group-in-range" }>,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const range = resolveBoundary(
    boundary.range,
    anchorDate,
    Temporal,
    context,
    lookups,
  );
  if (range?.kind !== "range") {
    return null;
  }

  const dates = expandWeekdaysBetween(
    range.start,
    range.end,
    boundary.group === "weekend" ? [6, 7] : [1, 2, 3, 4, 5],
  );
  const groupStartIndex =
    (boundary.ordinal - 1) * datesPerGroup(boundary.group);
  const selectedDates = dates.slice(
    groupStartIndex,
    groupStartIndex + datesPerGroup(boundary.group),
  );
  return selectedDates.length === datesPerGroup(boundary.group)
    ? {
        kind: "range",
        start: selectedDates[0] as PlainDate,
        end: selectedDates[selectedDates.length - 1] as PlainDate,
      }
    : null;
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

// Example: `applyHolidayExclusion(range, true, context)` converts a range into non-holiday dates.
function applyHolidayExclusion(
  value: Extract<DateValue, { kind: "range" }>,
  skipHolidays: boolean,
  context: ResolvedParseDateContext,
): DateValue {
  return skipHolidays
    ? {
        kind: "multiple",
        dates: expandDatesBetween(value.start, value.end).filter(
          (date) => !context.holidays?.includes(date),
        ),
      }
    : value;
}

// Example: `areContiguousRanges([week51, week52])` returns true for adjacent ranges.
function areContiguousRanges(
  ranges: readonly Extract<DateValue, { kind: "range" }>[],
): boolean {
  return ranges.every((range, index) => {
    const previousRange = ranges[index - 1];
    return (
      !previousRange || range.start.equals(previousRange.end.add({ days: 1 }))
    );
  });
}

// Example: `expandDatesBetween(start, end)` returns every date in an inclusive range.
function expandDatesBetween(start: PlainDate, end: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  let cursor = start;
  while (comparePlainDate(cursor, end) <= 0) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
  }
  return dates;
}

// Example: `expandWeekdaysBetween(start, end, [1, 5])` returns Mondays and Fridays in a range.
function expandWeekdaysBetween(
  start: PlainDate,
  end: PlainDate,
  weekdays: readonly number[],
): PlainDate[] {
  return expandDatesBetween(start, end).filter((date) =>
    weekdays.includes(date.dayOfWeek),
  );
}

// Example: `datesPerGroup("weekend")` returns `2`.
function datesPerGroup(group: DayGroupPeriod): number {
  return group === "weekend" ? 2 : 5;
}

// Example: `startOfCalendarWeek(date, 0)` returns the Sunday starting that week.
function startOfCalendarWeek(
  date: PlainDate,
  weekStartsOn: WeekdayIndex,
): PlainDate {
  const temporalWeekday = toTemporalWeekday(weekStartsOn);
  let cursor = date;

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

// Example: `endOfCalendarWeek(date, 0)` returns the Saturday ending that week.
function endOfCalendarWeek(
  date: PlainDate,
  weekStartsOn: WeekdayIndex,
): PlainDate {
  return startOfCalendarWeek(date, weekStartsOn).add({ days: 6 });
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

// Example: `toTemporalWeekday(0)` returns Temporal Sunday value `7`.
function toTemporalWeekday(weekStartsOn: WeekdayIndex): number {
  return weekStartsOn === 0 ? 7 : weekStartsOn;
}

// Example: `isBackwardModifier("previous")` returns true.
function isBackwardModifier(modifier: RelativeModifier): boolean {
  return BackwardRelativeModifierSet.has(modifier);
}

// Example: `isForwardModifier("upcoming")` returns true.
function isForwardModifier(modifier: RelativeModifier): boolean {
  return ForwardRelativeModifierSet.has(modifier);
}
