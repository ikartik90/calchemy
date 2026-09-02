import { parseMonthDayListFromInput, parseMonthDayRangeFromInput } from "../primitives/month-day-list";
import { parseAmount, parseOrdinal } from "../primitives/numbers";
import { parseDayGroup, parsePeriod } from "../primitives/periods";
import { parseStructuralShorthand } from "../primitives/shorthands";
import {
  type BoundaryPlacement,
  type BoundaryEndpointSide,
  type CalendarListPeriod,
  type CalendarRangePeriod,
  type DurationUnit,
  type RelationDirection,
  type RelativeDateValue,
  type RelativeModifier,
  type YearReferenceModifier,
  CalendarListPeriodSet,
  CalendarRangePeriodSet,
  RelativeDateSet,
  RelativeModifierSet,
  YearReferenceModifierSet,
} from "../types";
import type {
  BoundaryEndpointSlice,
  BoundarySlice,
  EachUnitPeriod,
  YearReferenceSlice,
} from "./types";
import type { DateVocabularyLookups } from "../vocabulary";

export type { RelativeModifier };

export type ParseBoundaryOptions = {
  preferDay?: boolean;
};

// Example: `parseBoundary("w52 next year", lookups)` returns a typed week boundary.
export function parseBoundary(
  input: string,
  lookups: DateVocabularyLookups,
  options?: ParseBoundaryOptions,
): BoundarySlice {
  const normalized = normalizeBoundaryInput(input);
  return (
    parseBoundarySideBoundary(normalized, lookups) ??
    parseOrdinalUnitFromAnchorBoundary(normalized, lookups) ??
    parseOrdinalWeekdayFromAnchorBoundary(normalized, lookups) ??
    parseDurationFromAnchorBoundary(normalized, lookups) ??
    parseDurationNearBoundary(normalized, lookups) ??
    parseYearBoundary(normalized) ??
    parseHolidaysBoundary(normalized) ??
    parseDayGroupFilterBoundary(normalized) ??
    parseEachUnitBoundary(normalized, lookups) ??
    parseRelativeBoundary(normalized, lookups) ??
    parseShorthandRangeListBoundary(normalized) ??
    parseMonthDayBoundary(normalized, lookups, options) ??
    parseMonthDayRangeBoundary(normalized, lookups) ??
    parseMonthDayListBoundary(normalized, lookups) ??
    parseNamedMonthBoundary(normalized, lookups) ??
    parseMonthBoundary(normalized) ??
    parseQuarterBoundary(normalized) ??
    parseWeekBoundary(normalized) ??
    parseWeekOfDateBoundary(normalized, lookups) ??
    parseCompositeAnchorBoundary(normalized, lookups) ??
    parseRangeBoundary(normalized, lookups) ??
    parseDateListBoundary(normalized, lookups) ??
    atomBoundary(normalized)
  );
}

// Example: `parseDateListBoundary("today and tomorrow", lookups)` returns discrete date list intent.
function parseDateListBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  if (!/(?:\s+(?:and|or)\s+|,\s*)/.test(input)) {
    return null;
  }

  if (/\b(?:between|until|from)\b/.test(input) || /\s(?:until|to)\s/.test(input)) {
    return null;
  }

  if (
    parseShorthandRangeListBoundary(input) ||
    parseOrdinalCalendarUnitBoundary(input, lookups) ||
    parseOrdinalCalendarUnitSpanBoundary(input, lookups) ||
    parseMonthDayListBoundary(input, lookups) ||
    parseMonthDayRangeBoundary(input, lookups) ||
    parseRangeBoundary(input, lookups)
  ) {
    return null;
  }

  const parts = input
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => normalizeBoundaryInput(value))
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return { kind: "date-list", items: parts.map((part) => parseBoundary(part, lookups)) };
}

// Example: `atomBoundary("christmas this year")` defers named-date atom parsing to primitives.
function atomBoundary(input: string): BoundarySlice {
  return { kind: "atom", input: input.trim() };
}

// Example: `rangeBoundary(atomBoundary("today"), atomBoundary("tomorrow"))` creates a typed explicit range.
export function rangeBoundary(start: BoundarySlice, end: BoundarySlice): BoundarySlice {
  return {
    kind: "range",
    start: boundaryEndpoint(start, "start"),
    end: boundaryEndpoint(end, "end"),
  };
}

// Example: `boundaryEndpoint(monthBoundary, "end")` selects the last day of a resolved range.
function boundaryEndpoint(boundary: BoundarySlice, side: BoundaryEndpointSide): BoundaryEndpointSlice {
  return { kind: "boundary", boundary, side };
}

// Example: `relativeMonthBoundary(3, "next")` describes next March without resolving a year yet.
export function relativeMonthBoundary(month: number, modifier: RelativeModifier): BoundarySlice {
  return { kind: "relative-month", month, modifier };
}

// Example: `anchorUntilBoundary(boundaryEndpoint(nextMonth, "end"))` describes a range from the anchor through an endpoint.
export function anchorUntilBoundary(end: BoundaryEndpointSlice): BoundarySlice {
  return { kind: "anchor-until", end };
}

// Example: `parseBoundaryEndpoint("end of next month", lookups, "end")` selects the end of next month.
export function parseBoundaryEndpoint(
  input: string,
  lookups: DateVocabularyLookups,
  side: BoundaryEndpointSide,
  options?: ParseBoundaryOptions,
): BoundaryEndpointSlice {
  const normalized = normalizeBoundaryInput(input);
  const relationReference = parseBoundaryRelationReference(normalized, lookups);
  if (relationReference) {
    return relationReference;
  }

  const boundarySideInput = parseBoundarySideInput(normalized);
  return boundarySideInput
    ? boundaryEndpoint(parseBoundary(boundarySideInput.input, lookups), boundarySideInput.side)
    : boundaryEndpoint(parseBoundary(normalized, lookups, options), side);
}

// Example: `parseBoundaryRelationReference("first monday after end of next month", lookups)` returns relation endpoint intent.
export function parseBoundaryRelationReference(input: string, lookups: DateVocabularyLookups): BoundaryEndpointSlice | null {
  const normalized = normalizeBoundaryInput(input);
  const relation = parseWeekdayRelationReference(normalized, lookups);
  return relation
    ? {
        kind: "relation",
        boundary: relation.boundary,
        relation: relation.relation,
      }
    : null;
}

// Example: `parseYearReference("next", undefined)` describes next year.
function parseYearReference(relativeYear: string | undefined, explicitYear: string | undefined): YearReferenceSlice {
  if (explicitYear) {
    return { kind: "explicit", year: Number(explicitYear) };
  }

  if (relativeYear && YearReferenceModifierSet.has(relativeYear as YearReferenceModifier)) {
    return { kind: "relative", value: relativeYear as YearReferenceModifier };
  }

  return { kind: "anchor" };
}

// Example: `parseBoundarySideBoundary("end of q3", lookups)` returns endpoint-selection intent for Q3.
function parseBoundarySideBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parsed = parseBoundarySideInput(input);
  return parsed ? { kind: "boundary-side", boundary: parseBoundary(parsed.input, lookups), side: parsed.side } : null;
}

// Example: `parseMonthBoundary("m3 22")` returns a March 2022 shorthand boundary.
function parseMonthBoundary(input: string): BoundarySlice | null {
  const match = /^(.+?)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  const shorthand = match?.[1] ? parseStructuralShorthand(match[1]) : null;
  if (shorthand?.kind !== "month") {
    return null;
  }

  return { kind: "month-range", month: shorthand.ordinal, year: parseYearReference(match?.[2], match?.[3]) };
}

// Example: `parseQuarterBoundary("first quarter of next year")` returns an ordinal quarter boundary.
function parseQuarterBoundary(input: string): BoundarySlice | null {
  const relativeMatch = /^(this|next|last|previous) quarter$/.exec(input);
  const relativeModifier = parseRelativeModifier(relativeMatch?.[1]);
  if (relativeModifier) {
    return { kind: "relative-quarter-range", modifier: relativeModifier };
  }

  const ordinalMatch = /^(.+) quarter(?: of)? (?:(this|next|last|previous) year|(\d{2,4}))$/.exec(input);
  if (ordinalMatch?.[1]) {
    const quarter = parseOrdinal(ordinalMatch[1]);
    return quarter && quarter >= 1 && quarter <= 4
      ? { kind: "quarter-range", quarter, year: parseYearReference(ordinalMatch[2], ordinalMatch[3]) }
      : null;
  }

  const shorthandMatch = /^(.+?)(?: (?:of )?(?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  const shorthand = shorthandMatch?.[1] ? parseStructuralShorthand(shorthandMatch[1]) : null;
  return shorthand?.kind === "quarter" && shorthand.ordinal >= 1 && shorthand.ordinal <= 4
    ? { kind: "quarter-range", quarter: shorthand.ordinal, year: parseYearReference(shorthandMatch?.[2], shorthandMatch?.[3]) }
    : null;
}

// Example: `parseWeekBoundary("week fifty two")` returns an ordinal week boundary.
function parseWeekBoundary(input: string): BoundarySlice | null {
  const shorthandMatch = /^(.+?)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  const shorthand = shorthandMatch?.[1] ? parseStructuralShorthand(shorthandMatch[1]) : null;
  if (shorthand?.kind === "week") {
    return { kind: "week-range", week: shorthand.ordinal, year: parseYearReference(shorthandMatch?.[2], shorthandMatch?.[3]) };
  }

  const match = /^(?:week (.+?)|(?:the )?(.+?) week)(?: (?:of )?(?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  const weekInput = match?.[1] ?? match?.[2];
  if (match?.[2] && (match[3] || match[4])) {
    return null;
  }

  const week = parseOrdinal(weekInput);
  return week && week >= 1 ? { kind: "week-range", week, year: parseYearReference(match?.[3], match?.[4]) } : null;
}

// Example: `parseWeekOfDateBoundary("week of aug 10", lookups)` returns the week containing August 10.
function parseWeekOfDateBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^(?:the )?week of (?:the )?(.+)$/.exec(input);
  return match?.[1] ? { kind: "week-of-date", anchor: parseBoundary(match[1], lookups) } : null;
}

// Example: `parseMonthDayBoundary("august 10", lookups)` returns a named month-day atom boundary.
function parseMonthDayBoundary(
  input: string,
  lookups: DateVocabularyLookups,
  options?: ParseBoundaryOptions,
): BoundarySlice | null {
  const match = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/.exec(input);
  const monthName = match?.[1];
  const day = match?.[2] ? Number(match[2]) : NaN;
  const month = monthName ? lookups.months.get(monthName) : undefined;
  if (!month || day < 1 || day > 31) {
    return null;
  }

  // Keep `june 27` as a month+year shorthand unless an endpoint explicitly prefers a calendar day.
  if (day > 12 && !options?.preferDay) {
    return null;
  }

  return atomBoundary(`${monthName} ${day}`);
}

// Example: `parseMonthDayListBoundary("august 10 14 and 17", lookups)` returns multiple August day intent.
function parseMonthDayListBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parsed = parseMonthDayListFromInput(input, lookups);
  return parsed ? { kind: "month-day-list", month: parsed.month, days: parsed.days } : null;
}

// Example: `parseMonthDayRangeBoundary("august 10-14", lookups)` returns August 10 through 14 in the anchor year.
function parseMonthDayRangeBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parsed = parseMonthDayRangeFromInput(input, lookups);
  return parsed
    ? { kind: "month-day-range", month: parsed.month, startDay: parsed.startDay, endDay: parsed.endDay }
    : null;
}

// Example: `parseYearBoundary("2027")` returns a full-year boundary.
function parseYearBoundary(input: string): BoundarySlice | null {
  const match = /^(\d{4})$/.exec(input);
  return match ? { kind: "year-range", year: Number(match[1]) } : null;
}

// Example: `parseHolidaysBoundary("holidays")` returns configured holiday intent.
function parseHolidaysBoundary(input: string): BoundarySlice | null {
  return input === "holidays" ? { kind: "holidays" } : null;
}

// Example: `parseDayGroupFilterBoundary("weekends")` returns weekend day-group intent.
function parseDayGroupFilterBoundary(input: string): BoundarySlice | null {
  const group = parseDayGroup(input);
  return group ? { kind: "day-group-filter", group } : null;
}

// Example: `parseNamedMonthBoundary("march 27", lookups)` returns a full-month boundary.
function parseNamedMonthBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^([a-z]+)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  const month = match?.[1] ? lookups.months.get(match[1]) : undefined;
  return month ? { kind: "month-range", month, year: parseYearReference(match?.[2], match?.[3]) } : null;
}

// Example: `parseRangeBoundary("from christmas to 7/1/2027", lookups)` returns typed endpoint boundaries.
function parseRangeBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parts = parseRangeParts(input);
  // Both sides of an explicit range are endpoints, so a bare `<month> <day>` such as
  // `sep 30` is a calendar day rather than a `<month> <two-digit year>` shorthand.
  return parts
    ? rangeBoundary(
        parseBoundary(parts[0], lookups, { preferDay: true }),
        parseBoundary(parts[1], lookups, { preferDay: true }),
      )
    : null;
}

// Example: `parseRangeParts("q1-q3")` returns `["q1", "q3"]`.
function parseRangeParts(input: string): [string, string] | null {
  const fromToMatch = /^from (.+) to (.+)$/.exec(input);
  if (fromToMatch?.[1] && fromToMatch[2]) {
    return [fromToMatch[1], fromToMatch[2]];
  }

  const betweenMatch = /^between (.+) and (.+)$/.exec(input);
  if (betweenMatch?.[1] && betweenMatch[2]) {
    return [betweenMatch[1], betweenMatch[2]];
  }

  const toMatch = /^(.+) to (.+)$/.exec(input);
  if (toMatch?.[1] && toMatch[2]) {
    return [toMatch[1], toMatch[2]];
  }

  const isoDate = String.raw`\d{4}-\d{1,2}-\d{1,2}`;
  const slashMatch = new RegExp(`^(${isoDate})/(${isoDate})$`).exec(input);
  if (slashMatch?.[1] && slashMatch[2]) {
    return [slashMatch[1], slashMatch[2]];
  }

  const hyphenParts = input.split("-");
  return hyphenParts.length === 2 && hyphenParts[0] && hyphenParts[1] ? [hyphenParts[0], hyphenParts[1]] : null;
}

// Example: `parseOrdinalUnitFromAnchorBoundary("ninth week from christmas", lookups)` returns the calendar unit N steps after any anchor date.
export function parseOrdinalUnitFromAnchorBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const shorthandMatch = /^([qwm])(\d+) from (.+)$/i.exec(input);
  if (shorthandMatch?.[1] && shorthandMatch[2] && shorthandMatch[3]) {
    const unit = parseStructuralShorthandUnit(shorthandMatch[1]);
    const ordinal = Number(shorthandMatch[2]);
    return unit && ordinal >= 1
      ? {
          kind: "ordinal-unit-from-anchor",
          ordinal,
          unit,
          anchor: parseBoundary(shorthandMatch[3], lookups),
        }
      : null;
  }

  const match = /^(?:the )?(.+?) ([a-z]+) from (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const unitToken = match[2];
  const unit = parseDurationUnit(unitToken, lookups);
  if (!unit || unit === "weekdays" || unit === "weekend" || unitToken.endsWith("s")) {
    return null;
  }

  // Only an ordinal-shaped head steps calendar units: `ninth week from today`.
  // A cardinal head is a duration — `1 week from now` is seven days out.
  const ordinal = parseOrdinalShaped(match[1]);
  return ordinal && ordinal >= 1
    ? {
        kind: "ordinal-unit-from-anchor",
        ordinal,
        unit,
        anchor: parseBoundary(match[3], lookups),
      }
    : null;
}

// Example: `parseOrdinalWeekdayFromAnchorBoundary("third monday from this monday", lookups)` returns the Nth weekday on or after an anchor.
export function parseOrdinalWeekdayFromAnchorBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^(?:the )?(.+?) ([a-z]+) from (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const weekday = lookups.weekdays.get(match[2]);
  if (!weekday) {
    return null;
  }

  const ordinal = parseOrdinal(match[1]);
  return ordinal && ordinal >= 1
    ? {
        kind: "ordinal-weekday-from-anchor",
        ordinal,
        weekday,
        anchor: parseBoundary(match[3], lookups),
      }
    : null;
}

// Example: `parseStructuralShorthandUnit("q")` returns `quarter`.
function parseStructuralShorthandUnit(letter: string): DurationUnit | null {
  switch (letter.toLowerCase()) {
    case "w":
      return "week";
    case "m":
      return "month";
    case "q":
      return "quarter";
    default:
      return null;
  }
}

// Example: `parseDurationFromAnchorBoundary("12 weeks from 3/6/26", lookups)` returns duration-plus-anchor intent.
function parseDurationFromAnchorBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^(.+) ([a-z]+) from (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || !match[3] || match[3] === "now") {
    return null;
  }

  const amount = parseAmount(match[1]);
  const unit = parseDurationUnit(match[2], lookups);
  return amount && unit ? { kind: "duration-from-anchor", amount, unit, anchor: parseBoundary(match[3], lookups) } : null;
}

// Example: `parseDurationNearBoundary("3 days before christmas", lookups)` returns offset intent.
function parseDurationNearBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  // `2 months ago` is `2 months before today`.
  const agoMatch = /^(.+) ([a-z]+) ago$/.exec(input);
  const agoAmount = parseAmount(agoMatch?.[1]);
  const agoUnit = parseDurationUnit(agoMatch?.[2], lookups);
  if (agoAmount && agoUnit && !parseDayGroup(agoMatch?.[2] ?? "")) {
    return {
      kind: "duration-near-boundary",
      amount: agoAmount,
      unit: agoUnit,
      direction: "before",
      anchor: { kind: "relative", expression: { kind: "bare", value: "today" } },
    };
  }

  const match = /^(?:(.+) )?([a-z]+) (after|before|following|preceding) (.+)$/.exec(input);
  if (!match?.[2] || !match[3] || !match[4]) {
    return null;
  }

  const unit = parseDurationUnit(match[2], lookups);
  if (!unit || parseDayGroup(match[2])) {
    return null;
  }

  const amount = match[1] ? parseAmount(match[1]) : 1;
  return amount
    ? {
        kind: "duration-near-boundary",
        amount,
        unit,
        direction: match[3] as RelationDirection,
        anchor: parseBoundary(match[4], lookups),
      }
    : null;
}

// Example: `parseEachUnitBoundary("every month", lookups)` returns recurrence scope over months in this year.
function parseEachUnitBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^(each|every) ([a-z]+)(?: (?:of|in) (?:the )?(.+))?$/.exec(input);
  if (!match?.[2]) {
    return null;
  }

  const unit = parseEachUnitPeriod(match[2], lookups);
  if (!unit) {
    return null;
  }

  return {
    kind: "each-unit",
    unit,
    within: match[3] ? parseBoundary(match[3], lookups) : defaultEachUnitWithinBoundary(),
  };
}

// Example: `defaultEachUnitWithinBoundary()` scopes each-unit phrases to the reference year by default.
function defaultEachUnitWithinBoundary(): BoundarySlice {
  return {
    kind: "relative",
    expression: {
      kind: "modifier",
      modifier: "this",
      target: { kind: "calendar-unit", unit: "year" },
    },
  };
}

// Example: `parseEachUnitPeriod("month", lookups)` returns `month`.
function parseEachUnitPeriod(input: string, lookups: DateVocabularyLookups): EachUnitPeriod | null {
  const period = parsePeriod(input);
  if (period === "week" || period === "month" || period === "quarter" || period === "year") {
    return period;
  }

  const durationUnit = parseDurationUnit(input, lookups);
  return durationUnit === "week" ||
    durationUnit === "month" ||
    durationUnit === "quarter" ||
    durationUnit === "year"
    ? durationUnit
    : null;
}

// Example: `parseRelativeBoundary("next month", lookups)` returns a typed relative modifier boundary.
function parseRelativeBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const bare = RelativeDateSet.has(input as never) ? input : null;
  if (bare) {
    return { kind: "relative", expression: { kind: "bare", value: bare as RelativeDateValue } };
  }

  const bareCalendarUnit = parseDurationUnit(input, lookups);
  if (bareCalendarUnit) {
    return { kind: "relative", expression: { kind: "modifier", modifier: "this", target: { kind: "calendar-unit", unit: bareCalendarUnit } } };
  }

  // A weekday on its own means its next occurrence, the way `upcoming tuesday` does.
  const bareWeekday = lookups.weekdays.get(input);
  if (bareWeekday) {
    return { kind: "relative", expression: { kind: "modifier", modifier: "upcoming", target: { kind: "weekday", weekday: bareWeekday } } };
  }

  const subset = parseLeadingOrTrailingDaysBoundary(input, lookups);
  if (subset) {
    return subset;
  }

  const fromNowMatch = /^(\w+|\d+) ([a-z]+) from now$/.exec(input);
  const fromNowAmount = parseAmount(fromNowMatch?.[1]);
  const fromNowUnit = parseDurationUnit(fromNowMatch?.[2], lookups);
  if (fromNowAmount && fromNowUnit) {
    return { kind: "relative", expression: { kind: "from-now", amount: fromNowAmount, unit: fromNowUnit } };
  }

  const impliedFromNowMatch = /^(.+) ([a-z]+)$/.exec(input);
  const impliedFromNowAmount = parseAmount(impliedFromNowMatch?.[1]);
  const impliedFromNowUnit = parseDurationUnit(impliedFromNowMatch?.[2], lookups);
  if (impliedFromNowAmount && impliedFromNowUnit) {
    return { kind: "relative", expression: { kind: "from-now", amount: impliedFromNowAmount, unit: impliedFromNowUnit } };
  }

  const lastDaysMatch = /^last (\d+) days$/.exec(input);
  if (lastDaysMatch?.[1]) {
    return {
      kind: "relative",
      expression: {
        kind: "modifier",
        modifier: "last",
        target: { kind: "counted-duration", count: Number(lastDaysMatch[1]), unit: "day" },
      },
    };
  }

  const modifierMatch = /^([a-z]+) (.+)$/.exec(input);
  const modifier = parseRelativeModifier(modifierMatch?.[1]);
  if (!modifier || !modifierMatch?.[2]) {
    return null;
  }

  // `this` adds nothing in front of another modifier: `this coming friday` is
  // `upcoming friday`, `this past week` is `past week`.
  if (modifier === "this" && parseRelativeModifier(modifierMatch[2].split(" ")[0])) {
    return parseRelativeBoundary(modifierMatch[2], lookups);
  }

  // `next april` is the next occurrence of April; the year is settled at resolve time.
  const relativeMonth = lookups.months.get(modifierMatch[2]);
  if (relativeMonth) {
    return relativeMonthBoundary(relativeMonth, modifier);
  }

  const target = parseRelativeTarget(modifierMatch[2], lookups);
  return target ? { kind: "relative", expression: { kind: "modifier", modifier, target } } : null;
}

// Example: `parseLeadingOrTrailingDaysBoundary("first 10 days of next month", lookups)` returns a subrange boundary.
function parseLeadingOrTrailingDaysBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const skipHolidays = /\s+(?:excluding|excl|skip) holidays$/.test(input);
  const rangeInput = skipHolidays ? input.replace(/\s+(?:excluding|excl|skip) holidays$/, "") : input;
  const trailingUnitMatch = /^(last) (day|weekday|week|month|quarter|year) (?:of|in) (?:the )?(.+)$/.exec(rangeInput);
  if (trailingUnitMatch?.[1] && trailingUnitMatch[2] && trailingUnitMatch[3]) {
    const unit = parseDurationUnit(trailingUnitMatch[2], lookups);
    if (!unit) {
      return null;
    }

    return {
      kind: "edge-count-unit-in-range",
      edge: "last",
      count: 1,
      unit,
      range: parseBoundary(trailingUnitMatch[3], lookups),
      skipHolidays,
    };
  }

  // `first day of` and `first weekday of` both pick one date off an edge.
  const singularDayMatch = /^(first|last) (day|weekday) (?:of|in) (?:the )?(.+)$/.exec(rangeInput);
  if (singularDayMatch?.[1] && singularDayMatch[2] && singularDayMatch[3]) {
    return {
      kind: "edge-count-unit-in-range",
      edge: singularDayMatch[1] as BoundaryPlacement,
      count: 1,
      unit: singularDayMatch[2] === "weekday" ? "weekdays" : "day",
      range: parseBoundary(singularDayMatch[3], lookups),
      skipHolidays,
    };
  }

  const match = /^(first|last) (.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(rangeInput);
  const count = parseAmount(match?.[2]);
  const unit = parseDurationUnit(match?.[3], lookups);
  return match?.[1] && count && unit && match[4]
    ? {
        kind: "edge-count-unit-in-range",
        edge: match[1] as BoundaryPlacement,
        count,
        unit,
        range: parseBoundary(match[4], lookups),
        skipHolidays,
      }
    : null;
}

// Example: `parseRelativeTarget("3 fridays", lookups)` returns a counted-weekday target.
function parseRelativeTarget(input: string, lookups: DateVocabularyLookups): BoundarySlice["kind"] extends never ? never : import("./types").RelativeTargetSlice | null {
  const countedMatch = /^(.+) ([a-z]+)$/.exec(input);
  const count = parseAmount(countedMatch?.[1]);
  const countedTarget = countedMatch?.[2];
  if (count && countedTarget) {
    const durationUnit = parseDurationUnit(countedTarget, lookups);
    if (durationUnit) {
      return { kind: "counted-duration", count, unit: durationUnit };
    }

    const weekday = lookups.weekdays.get(countedTarget);
    if (weekday) {
      return { kind: "counted-weekday", count, weekday };
    }
  }

  const dayGroup = parseDayGroup(input);
  if (dayGroup) {
    return { kind: "day-group", group: dayGroup };
  }

  const weekday = lookups.weekdays.get(input);
  if (weekday) {
    return { kind: "weekday", weekday };
  }

  const calendarUnit = parseDurationUnit(input, lookups);
  return calendarUnit ? { kind: "calendar-unit", unit: calendarUnit } : null;
}

// Example: `parseCompositeAnchorBoundary("third week of last quarter", lookups)` returns an ordinal-in-range boundary.
function parseCompositeAnchorBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  return (
    parseOrdinalCalendarUnitSpanBoundary(input, lookups) ??
    parseOrdinalCalendarUnitBoundary(input, lookups) ??
    parseOrdinalDayGroupBoundary(input, lookups) ??
    parseOrdinalWeekdayBoundary(input, lookups) ??
    parseUniqueWeekdayBoundary(input, lookups) ??
    parseHalfBoundary(input, lookups) ??
    parseOrdinalDayBoundary(input, lookups) ??
    parseShiftedAnchorBoundary(input, lookups)
  );
}

// Example: `parseHalfBoundary("second half of next year", lookups)` selects July through December of next year.
function parseHalfBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const match = /^(?:the )?(first|second|last|latter) half (?:of|in) (?:the )?(.+)$/.exec(input);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    kind: "half-of-range",
    half: match[1] === "first" ? "first" : "second",
    range: parseBoundary(match[2], lookups),
  };
}

// Example: `parseOrdinalDayBoundary("15th of next month", lookups)` selects the 15th inside next month;
// `parseOrdinalDayBoundary("the 15th", lookups)` selects it inside this month.
function parseOrdinalDayBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const scoped = /^(?:the )?(.+?)(?: day)? (?:of|in) (?:the )?(.+)$/.exec(input);
  const day = parseOrdinalDay(scoped ? scoped[1] : input);
  if (!day) {
    return null;
  }

  const range: BoundarySlice = scoped?.[2]
    ? parseBoundary(scoped[2], lookups)
    : { kind: "relative", expression: { kind: "modifier", modifier: "this", target: { kind: "calendar-unit", unit: "month" } } };
  return { kind: "ordinal-day-in-range", day, range };
}

// Example: `parseOrdinalDay("15th")` and `parseOrdinalDay("fifteenth")` return 15; `parseOrdinalDay("15")` returns null,
// because a bare number is not a day-of-month claim.
function parseOrdinalDay(input: string | undefined): number | null {
  const day = parseOrdinalShaped(input);
  return day && day >= 1 && day <= 31 ? day : null;
}

// Example: `parseOrdinalShaped("3rd")` and `parseOrdinalShaped("third")` return 3; `parseOrdinalShaped("3")` and
// `parseOrdinalShaped("three")` return null, because a cardinal is not an ordinal even though it names a number.
function parseOrdinalShaped(input: string | undefined): number | null {
  if (!input || !/(?:\d(?:st|nd|rd|th)|first|second|third|th)$/.test(input)) {
    return null;
  }

  return parseOrdinal(input);
}

// Example: `parseOrdinalCalendarUnitSpanBoundary("between 50th and 52nd week this year", lookups)` returns a span boundary.
function parseOrdinalCalendarUnitSpanBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const postfixMatch = /^between (.+) and (.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  const postfixUnit = parseCalendarUnit(postfixMatch?.[3], ["week", "month"]);
  if (postfixMatch?.[1] && postfixMatch[2] && postfixUnit && postfixMatch[4]) {
    const startOrdinal = parseOrdinal(postfixMatch[1]);
    const endOrdinal = parseOrdinal(postfixMatch[2]);
    return startOrdinal && endOrdinal
      ? {
          kind: "ordinal-calendar-unit-span",
          startOrdinal,
          endOrdinal,
          unit: postfixUnit,
          range: parseBoundary(postfixMatch[4], lookups),
        }
      : null;
  }

  const barePostfixMatch = /^between (.+) and (.+) ([a-z]+) ((?:this|next|upcoming|future|last|previous|past) [a-z]+)$/.exec(input);
  const barePostfixUnit = parseCalendarUnit(barePostfixMatch?.[3], ["week", "month"]);
  if (barePostfixMatch?.[1] && barePostfixMatch[2] && barePostfixUnit && barePostfixMatch[4]) {
    const startOrdinal = parseOrdinal(barePostfixMatch[1]);
    const endOrdinal = parseOrdinal(barePostfixMatch[2]);
    return startOrdinal && endOrdinal
      ? {
          kind: "ordinal-calendar-unit-span",
          startOrdinal,
          endOrdinal,
          unit: barePostfixUnit,
          range: parseBoundary(barePostfixMatch[4], lookups),
        }
      : null;
  }

  return null;
}

// Example: `parseOrdinalCalendarUnitBoundary("51st and 52nd week this year", lookups)` returns selected weeks in a year.
function parseOrdinalCalendarUnitBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parts = parseOrdinalCalendarUnitParts(input);
  if (!parts) {
    return null;
  }

  const ordinal = parseOrdinal(parts.ordinalInput);
  const ordinals = ordinal ? [ordinal] : parseOrdinalList(parts.ordinalInput);
  return ordinals.length > 0
    ? {
        kind: "ordinal-calendar-unit",
        ordinals,
        unit: parts.unit,
        range: coerceOrdinalRangeToEachUnit(parseBoundary(parts.rangeInput, lookups)),
      }
    : null;
}

// Example: `parseOrdinalCalendarUnitParts("third week of last quarter")` splits ordinal, unit, and range text.
function parseOrdinalCalendarUnitParts(input: string): { ordinalInput: string; unit: CalendarListPeriod; rangeInput: string } | null {
  const postfixMatch = /^(?:the )?(.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  const postfixUnit = parseCalendarUnit(postfixMatch?.[2], ["week", "month"]);
  if (postfixMatch?.[1] && postfixUnit && postfixMatch[3]) {
    return { ordinalInput: postfixMatch[1], unit: postfixUnit, rangeInput: postfixMatch[3] };
  }

  const barePostfixMatch = /^(?:the )?(.+) ([a-z]+) ((?:this|next|upcoming|future|last|previous|past) [a-z]+)$/.exec(input);
  const barePostfixUnit = parseCalendarUnit(barePostfixMatch?.[2], ["week", "month"]);
  if (barePostfixMatch?.[1] && barePostfixUnit && barePostfixMatch[3]) {
    return { ordinalInput: barePostfixMatch[1], unit: barePostfixUnit, rangeInput: barePostfixMatch[3] };
  }

  const prefixMatch = /^(?:the )?(.+) (.+) ([a-z]+)$/.exec(input);
  const prefixUnit = parseCalendarUnit(prefixMatch?.[3], ["week", "month"]);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixUnit) {
    return { ordinalInput: prefixMatch[2], unit: prefixUnit, rangeInput: prefixMatch[1] };
  }

  return null;
}

// Example: `parseShiftedAnchorBoundary("tomorrow next month", lookups)` returns projection intent.
function parseShiftedAnchorBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  if (isNamedDateYearPhrase(input, lookups)) {
    return null;
  }

  const match = /^(.+) ((?:this|next|upcoming|future|last|previous|past) ([a-z]+))$/.exec(input);
  const unit = parseCalendarRangeUnit(match?.[3]);
  return match?.[1] && match[2] && unit
    ? { kind: "shifted-anchor", anchor: parseBoundary(match[1], lookups), range: parseBoundary(match[2], lookups), unit }
    : null;
}

// Example: `parseOrdinalWeekdayBoundary("first sunday of next month", lookups)` returns an ordinal weekday selector.
function parseOrdinalWeekdayBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const parts = parseOrdinalWeekdayParts(input);
  const ordinal = parseOrdinal(parts?.ordinalInput);
  const weekday = parts?.weekdayInput ? lookups.weekdays.get(parts.weekdayInput) : undefined;
  return parts && ordinal && weekday
    ? {
        kind: "ordinal-weekday-in-range",
        ordinal,
        weekday,
        range: coerceOrdinalRangeToEachUnit(parseBoundary(parts.rangeInput, lookups)),
      }
    : null;
}

// Example: `parseOrdinalWeekdayParts("next month first sunday")` splits ordinal weekday parts.
function parseOrdinalWeekdayParts(input: string): { ordinalInput: string; weekdayInput: string; rangeInput: string } | null {
  const postfixMatch = /^(?:the )?(.+) ([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2] && postfixMatch[3]) {
    return { ordinalInput: postfixMatch[1], weekdayInput: postfixMatch[2], rangeInput: postfixMatch[3] };
  }

  const barePostfixMatch = /^(?:the )?(.+) ([a-z]+) ((?:this|next|upcoming|future|last|previous|past) [a-z]+)$/.exec(input);
  if (barePostfixMatch?.[1] && barePostfixMatch[2] && barePostfixMatch[3]) {
    return { ordinalInput: barePostfixMatch[1], weekdayInput: barePostfixMatch[2], rangeInput: barePostfixMatch[3] };
  }

  const prefixMatch = /^(?:the )?(.+) (.+) ([a-z]+)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixMatch[3]) {
    return { ordinalInput: prefixMatch[2], weekdayInput: prefixMatch[3], rangeInput: prefixMatch[1] };
  }

  return null;
}

// Example: `parseUniqueWeekdayBoundary("sunday of next week", lookups)` returns a unique weekday-in-range selector.
function parseUniqueWeekdayBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const postfixMatch = /^(?:the )?([a-z]+) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2]) {
    const weekday = lookups.weekdays.get(postfixMatch[1]);
    return weekday ? { kind: "unique-weekday-in-range", weekday, range: parseBoundary(postfixMatch[2], lookups) } : null;
  }

  const prefixMatch = /^(?:the )?(.+) ([a-z]+)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2]) {
    const weekday = lookups.weekdays.get(prefixMatch[2]);
    return weekday ? { kind: "unique-weekday-in-range", weekday, range: parseBoundary(prefixMatch[1], lookups) } : null;
  }

  return null;
}

// Example: `parseOrdinalDayGroupBoundary("second weekend of next month", lookups)` returns selected day-group intent.
function parseOrdinalDayGroupBoundary(input: string, lookups: DateVocabularyLookups): BoundarySlice | null {
  const postfixMatch = /^(?:the )?(.+) (weekend|weekends|weekday|weekdays) (?:of|in) (?:the )?(.+)$/.exec(input);
  if (postfixMatch?.[1] && postfixMatch[2] && postfixMatch[3]) {
    const ordinal = parseOrdinal(postfixMatch[1]);
    const group = parseDayGroup(postfixMatch[2]);
    return ordinal && group
      ? {
          kind: "ordinal-day-group-in-range",
          ordinal,
          group,
          range: coerceOrdinalRangeToEachUnit(parseBoundary(postfixMatch[3], lookups)),
        }
      : null;
  }

  const prefixMatch = /^(?:the )?(.+) (.+) (weekend|weekends|weekday|weekdays)$/.exec(input);
  if (prefixMatch?.[1] && prefixMatch[2] && prefixMatch[3]) {
    const ordinal = parseOrdinal(prefixMatch[2]);
    const group = parseDayGroup(prefixMatch[3]);
    return ordinal && group
      ? {
          kind: "ordinal-day-group-in-range",
          ordinal,
          group,
          range: coerceOrdinalRangeToEachUnit(parseBoundary(prefixMatch[1], lookups)),
        }
      : null;
  }

  return null;
}

// Example: `parseShorthandRangeListBoundary("w51 and w52 next year")` returns multiple week ranges.
function parseShorthandRangeListBoundary(input: string): BoundarySlice | null {
  const match = /^((?:[wm]\s*)?\d+(?:\s*(?:and|or|,)\s*(?:[wm]\s*)?\d+)+)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const tokens = match[1]
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const first = tokens[0] ? parseStructuralShorthand(tokens[0]) : null;
  if (!first || (first.kind !== "week" && first.kind !== "month")) {
    return null;
  }

  const ordinals = tokens.map((token) => parseStructuralShorthand(token)?.ordinal ?? parseAmount(token));
  return ordinals.some((ordinal) => !ordinal)
    ? null
    : {
        kind: "shorthand-range-list",
        unit: first.kind,
        ordinals: ordinals as number[],
        year: parseYearReference(match[2], match[3]),
      };
}

// Example: `parseOrdinalList("51st and 52nd")` returns `[51, 52]`.
function parseOrdinalList(input: string): number[] {
  const values = input
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseOrdinal(value));
  return values.length > 1 && values.every((value) => value !== null) ? Array.from(new Set(values as number[])) : [];
}

// Example: `parseWeekdayRelationReference("first monday after next month", lookups)` returns relation intent.
function parseWeekdayRelationReference(input: string, lookups: DateVocabularyLookups): { boundary: BoundarySlice; relation: import("./types").RelationSlice } | null {
  const relationMatch = /^(?:the )?(.+) ([a-z]+) (after|before|following|preceding) (.+)$/.exec(input);
  const ordinal = parseOrdinal(relationMatch?.[1]);
  const weekday = relationMatch?.[2] ? lookups.weekdays.get(relationMatch[2]) : undefined;
  return ordinal && weekday && relationMatch?.[3] && relationMatch[4]
    ? {
        boundary: parseBoundary(normalizeBoundaryInput(relationMatch[4]), lookups),
        relation: {
          kind: "weekday-near-boundary",
          direction: relationMatch[3] as RelationDirection,
          ordinal,
          weekday,
        },
      }
    : null;
}

// Example: `parseBoundarySideInput("end of next month")` returns side `end` and input `next month`.
function parseBoundarySideInput(input: string): { side: BoundaryEndpointSide; input: string } | null {
  const match = /^(start|end) of (?:the )?(.+)$/.exec(input);
  return match?.[1] && match[2] ? { side: match[1] as BoundaryEndpointSide, input: match[2] } : null;
}

// Example: `parseDurationUnit("weeks")` returns `week`.
function parseDurationUnit(input: string | undefined, lookups: DateVocabularyLookups): DurationUnit | null {
  const unit = input ? lookups.durationUnits.get(input) : undefined;
  return unit ?? null;
}

// Example: `parseCalendarUnit("week", ["week", "month"])` returns `week`.
function parseCalendarUnit(input: string | undefined, allowed: readonly CalendarListPeriod[]): CalendarListPeriod | null {
  const period = input ? parsePeriod(input) : null;
  return period && CalendarListPeriodSet.has(period) && allowed.includes(period as never) ? (period as CalendarListPeriod) : null;
}

// Example: `parseCalendarRangeUnit("quarter")` returns `quarter`.
function parseCalendarRangeUnit(input: string | undefined): CalendarRangePeriod | null {
  const period = input ? parsePeriod(input) : null;
  return period && CalendarRangePeriodSet.has(period) ? (period as CalendarRangePeriod) : null;
}

// Example: `parseRelativeModifier("previous")` returns `previous`.
function parseRelativeModifier(value: string | undefined): RelativeModifier | null {
  return RelativeModifierSet.has(value as RelativeModifier) ? (value as RelativeModifier) : null;
}

// Example: `isNamedDateYearPhrase("easter next year", lookups)` lets named-date primitives own the phrase.
function isNamedDateYearPhrase(input: string, lookups: DateVocabularyLookups): boolean {
  const match = /^(.*) (?:this|next|last|previous) year$/.exec(input) ?? /^(.*) \d{2,4}$/.exec(input);
  const name = match?.[1];
  return Boolean(name && lookups.namedDates.some((entry) => entry.value.toLowerCase() === name));
}

// Example: `coerceOrdinalRangeToEachUnit({ kind: "relative", expression: next 5 months })` iterates each month in the counted span.
function coerceOrdinalRangeToEachUnit(range: BoundarySlice): BoundarySlice {
  if (range.kind === "each-unit") {
    return range;
  }

  if (range.kind !== "relative" || range.expression.kind !== "modifier") {
    return range;
  }

  const target = range.expression.target;
  if (target.kind !== "counted-duration") {
    return range;
  }

  const eachUnit = countedDurationToEachUnitPeriod(target.unit);
  return eachUnit ? { kind: "each-unit", unit: eachUnit, within: range } : range;
}

// Example: `countedDurationToEachUnitPeriod("month")` returns `month`.
function countedDurationToEachUnitPeriod(unit: DurationUnit): EachUnitPeriod | null {
  switch (unit) {
    case "week":
      return "week";
    case "month":
      return "month";
    case "quarter":
      return "quarter";
    case "year":
      return "year";
    default:
      return null;
  }
}

// Example: `normalizeBoundaryInput(" in the next month ")` removes ignorable wrapper text: a leading
// article, and a leading `in` or `during`, which only ever introduce the phrase that follows.
function normalizeBoundaryInput(input: string): string {
  return input
    .trim()
    .replace(/^(?:in|during) /, "")
    .replace(/^within (?:the )?(?:next )?/, "next ")
    .replace(/^the /, "");
}
