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
  | { kind: "anchor-until"; end: BoundaryEndpointSlice };

export type BoundaryEndpointSlice =
  | { kind: "boundary"; boundary: BoundarySlice; side: BoundaryEndpointSide }
  | { kind: "relation"; boundary: BoundarySlice; relation: RelationSlice };

export type RelativeExpressionSlice =
  | { kind: "bare"; value: RelativeDateValue }
  | { kind: "from-now"; amount: number; unit: DurationUnit }
  | {
      kind: "leading-trailing-days";
      edge: BoundaryPlacement;
      count: number;
      range: BoundarySlice;
      skipHolidays: boolean;
    }
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
      kind: "weekday-in-boundary";
      placement: BoundaryPlacement;
      weekday: number;
    };

export type TransformSlice = {
  amount: number;
  operator: TransformOperator;
  unit: DurationUnit;
};

export type ExclusionSlice =
  | { kind: "boundary"; boundary: BoundarySlice }
  | { kind: "holidays" }
  | { kind: "months"; months: number[] }
  | { kind: "weekdays" }
  | { kind: "weekends" }
  | { kind: "years"; years: number[] };

export type DateSlice = {
  boundary: BoundarySlice;
  exclusions: ExclusionSlice[];
  relation: RelationSlice | null;
  sampler: SamplerSlice | null;
  transforms: TransformSlice[];
};
