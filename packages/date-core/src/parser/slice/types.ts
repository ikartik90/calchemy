import type {
  BoundaryEndpointSide,
  BoundaryPlacement,
  CalendarListPeriod,
  CalendarRangePeriod,
  DayGroupPeriod,
  DurationUnit,
  RelationDirection,
  RelativeDateValue,
  RelativeModifier,
  TransformOperator,
  YearReferenceModifier,
} from "../types";
import type { SamplerSlice } from "./sampler";

export type EachUnitPeriod = "week" | "month" | "quarter" | "year";

export type RangeHalf = "first" | "second";

export type BoundarySlice =
  | { kind: "atom"; input: string }
  | {
      kind: "boundary-side";
      boundary: BoundarySlice;
      side: BoundaryEndpointSide;
    }
  | { kind: "range"; start: BoundaryEndpointSlice; end: BoundaryEndpointSlice }
  | { kind: "month-range"; month: number; year: YearReferenceSlice }
  | { kind: "named-month-range"; month: number }
  | { kind: "quarter-range"; quarter: number; year: YearReferenceSlice }
  | { kind: "relative-quarter-range"; modifier: RelativeModifier }
  | { kind: "week-range"; week: number; year: YearReferenceSlice }
  | { kind: "relative"; expression: RelativeExpressionSlice }
  | {
      kind: "duration-from-anchor";
      amount: number;
      unit: DurationUnit;
      anchor: BoundarySlice;
    }
  | {
      kind: "duration-near-boundary";
      amount: number;
      unit: DurationUnit;
      direction: RelationDirection;
      anchor: BoundarySlice;
    }
  | {
      kind: "shorthand-range-list";
      unit: CalendarListPeriod;
      ordinals: number[];
      year: YearReferenceSlice;
    }
  | {
      kind: "ordinal-calendar-unit-span";
      startOrdinal: number;
      endOrdinal: number;
      unit: CalendarListPeriod;
      range: BoundarySlice;
    }
  | {
      kind: "ordinal-calendar-unit";
      ordinals: number[];
      unit: CalendarListPeriod;
      range: BoundarySlice;
    }
  | {
      kind: "shifted-anchor";
      anchor: BoundarySlice;
      range: BoundarySlice;
      unit: CalendarRangePeriod;
    }
  | {
      kind: "edge-count-unit-in-range";
      edge: BoundaryPlacement;
      count: number;
      unit: DurationUnit;
      range: BoundarySlice;
      skipHolidays: boolean;
    }
  | { kind: "ordinal-day-in-range"; day: number; range: BoundarySlice }
  | { kind: "half-of-range"; half: RangeHalf; range: BoundarySlice }
  | { kind: "unique-weekday-in-range"; weekday: number; range: BoundarySlice }
  | {
      kind: "ordinal-weekday-in-range";
      ordinal: number;
      weekday: number;
      range: BoundarySlice;
    }
  | {
      kind: "ordinal-day-group-in-range";
      ordinal: number;
      group: DayGroupPeriod;
      range: BoundarySlice;
    }
  | { kind: "relative-month"; month: number; modifier: RelativeModifier }
  | { kind: "anchor-until"; end: BoundaryEndpointSlice }
  | { kind: "year-range"; year: number }
  | { kind: "holidays" }
  | { kind: "day-group-filter"; group: DayGroupPeriod }
  | { kind: "month-day-list"; month: number; days: number[] }
  | { kind: "month-day-range"; month: number; startDay: number; endDay: number }
  | { kind: "date-list"; items: BoundarySlice[] }
  | { kind: "week-of-date"; anchor: BoundarySlice }
  | {
      kind: "ordinal-unit-from-anchor";
      ordinal: number;
      unit: DurationUnit;
      anchor: BoundarySlice;
    }
  | {
      kind: "ordinal-weekday-from-anchor";
      ordinal: number;
      weekday: number;
      anchor: BoundarySlice;
    }
  | { kind: "each-unit"; unit: EachUnitPeriod; within: BoundarySlice };

/**
 * Boundary kinds that compose another boundary. The grammar emits them as a
 * parse tree; the lowering pass unfolds every one into an expression node, so
 * the boundary resolver only ever evaluates `LeafBoundarySlice`.
 */
export type CompositionalBoundaryKind =
  | "each-unit"
  | "ordinal-calendar-unit"
  | "ordinal-calendar-unit-span"
  | "edge-count-unit-in-range"
  | "ordinal-day-in-range"
  | "half-of-range"
  | "unique-weekday-in-range"
  | "ordinal-weekday-in-range"
  | "ordinal-day-group-in-range";

export type CompositionalBoundarySlice = Extract<BoundarySlice, { kind: CompositionalBoundaryKind }>;

export type LeafBoundarySlice = Exclude<BoundarySlice, CompositionalBoundarySlice>;

export type BoundaryEndpointSlice =
  | { kind: "boundary"; boundary: BoundarySlice; side: BoundaryEndpointSide }
  | { kind: "relation"; boundary: BoundarySlice; relation: RelationSlice };

export type RelativeExpressionSlice =
  | { kind: "bare"; value: RelativeDateValue }
  | { kind: "from-now"; amount: number; unit: DurationUnit }
  | {
      kind: "modifier";
      modifier: RelativeModifier;
      target: RelativeTargetSlice;
    };

export type RelativeTargetSlice =
  | { kind: "calendar-unit"; unit: DurationUnit }
  | { kind: "counted-duration"; count: number; unit: DurationUnit }
  | { kind: "counted-weekday"; count: number; weekday: number }
  | { kind: "day-group"; group: DayGroupPeriod }
  | { kind: "weekday"; weekday: number };

export type YearReferenceSlice =
  | { kind: "anchor" }
  | { kind: "explicit"; year: number }
  | { kind: "relative"; value: YearReferenceModifier };

export type RelationSlice =
  | {
      kind: "weekday-near-boundary";
      direction: RelationDirection;
      ordinal: number;
      weekday: number;
    }
  | {
      kind: "day-group-near-boundary";
      direction: RelationDirection;
      ordinal: number;
      group: DayGroupPeriod;
    }
  | {
      kind: "weekday-in-boundary";
      placement: BoundaryPlacement;
      weekday: number;
    };

export type TransformSlice = {
  amount: number;
  operator: TransformOperator;
  unit: DurationUnit;
};

export type { DateSlice, ExclusionSlice } from "../expression/types";
