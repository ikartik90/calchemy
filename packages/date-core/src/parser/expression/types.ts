import type {
  BoundaryPlacement,
  CalendarListPeriod,
  DayGroupPeriod,
  DurationUnit,
  RelationDirection,
  RelativeModifier,
} from "../types";
import type { LeafBoundarySlice, RangeHalf, RelationSlice, TransformSlice } from "../slice/types";
import type { SamplerSlice } from "../slice/sampler";

export type EachUnitPeriod = "week" | "month" | "quarter" | "year";

export type SelectOperator =
  | {
      kind: "edge-count-unit";
      edge: BoundaryPlacement;
      count: number;
      unit: DurationUnit;
      skipHolidays?: boolean;
    }
  | { kind: "ordinal-units"; ordinals: number[]; unit: CalendarListPeriod }
  | {
      kind: "ordinal-units-span";
      startOrdinal: number;
      endOrdinal: number;
      unit: CalendarListPeriod;
    }
  | { kind: "ordinal-day"; day: number }
  | { kind: "half"; half: RangeHalf }
  | { kind: "ordinal-weekday"; ordinal: number; weekday: number }
  | { kind: "ordinal-day-group"; ordinal: number; group: DayGroupPeriod }
  | { kind: "unique-weekday"; weekday: number }
  | { kind: "near-relation"; relation: RelationSlice }
  | { kind: "weekday-in-period"; placement: BoundaryPlacement; weekday: number };

export type IterateOperator =
  | { kind: "each-unit"; unit: EachUnitPeriod }
  | {
      kind: "counted-duration";
      modifier: RelativeModifier;
      count: number;
      unit: DurationUnit;
    };

export type DateExpression =
  | { kind: "scope"; boundary: LeafBoundarySlice }
  | { kind: "select"; select: SelectOperator; inner: DateExpression }
  | { kind: "iterate"; iterate: IterateOperator; inner: DateExpression }
  | { kind: "sample"; sampler: SamplerSlice; inner: DateExpression };

export type DateSlice = {
  expression: DateExpression;
  exclusions: DateSlice[];
  transforms: TransformSlice[];
};

export type ExclusionSlice = DateSlice;
