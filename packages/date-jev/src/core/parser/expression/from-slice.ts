import type { BoundarySlice, CompositionalBoundarySlice, RelationSlice } from "../slice/types";
import type { SamplerSlice } from "../slice/sampler";
import type { DateExpression } from "./types";

export function wrapExpression(
  inner: DateExpression,
  sampler: SamplerSlice | null,
  relation: RelationSlice | null,
): DateExpression {
  let expression = inner;

  if (relation) {
    expression =
      relation.kind === "weekday-in-boundary"
        ? {
            kind: "select",
            select: {
              kind: "weekday-in-period",
              placement: relation.placement,
              weekday: relation.weekday,
            },
            inner: expression,
          }
        : {
            kind: "select",
            select: { kind: "near-relation", relation },
            inner: expression,
          };
  }

  if (sampler) {
    expression = { kind: "sample", sampler, inner: expression };
  }

  return expression;
}

/**
 * Boundary kinds that compose another boundary. Every one of them is unfolded
 * by `boundaryToExpression`; the boundary resolver never evaluates them itself.
 *
 * Example: `isCompositionalBoundary({ kind: "each-unit", ... })` returns true.
 */
export function isCompositionalBoundary(boundary: BoundarySlice): boundary is CompositionalBoundarySlice {
  switch (boundary.kind) {
    case "each-unit":
    case "ordinal-calendar-unit":
    case "ordinal-calendar-unit-span":
    case "edge-count-unit-in-range":
    case "ordinal-day-in-range":
    case "half-of-range":
    case "unique-weekday-in-range":
    case "ordinal-weekday-in-range":
    case "ordinal-day-group-in-range":
      return true;
    default:
      return false;
  }
}

/**
 * Lowers a grammar boundary into the expression tree.
 *
 * The grammar emits a parse tree in which compositional intent — "the first
 * week *of* something", "each month *in* something" — is folded into
 * `BoundarySlice` variants that carry an inner boundary. This pass unfolds
 * every such variant into a `select` or `iterate` node over the lowered inner
 * boundary, recursively, so the resolver only ever sees composition as
 * expression nodes and boundaries as leaves.
 *
 * Example: `boundaryToExpression(firstWeekOfNextMonth)` returns a `select`
 * for ordinal week 1 whose inner expression is a `scope` on `next month`.
 */
export function boundaryToExpression(boundary: BoundarySlice): DateExpression {
  switch (boundary.kind) {
    case "each-unit":
      return {
        kind: "iterate",
        iterate: { kind: "each-unit", unit: boundary.unit },
        inner: boundaryToExpression(boundary.within),
      };
    case "ordinal-calendar-unit":
      return {
        kind: "select",
        select: { kind: "ordinal-units", ordinals: boundary.ordinals, unit: boundary.unit },
        inner: boundaryToExpression(boundary.range),
      };
    case "ordinal-calendar-unit-span":
      return {
        kind: "select",
        select: {
          kind: "ordinal-units-span",
          startOrdinal: boundary.startOrdinal,
          endOrdinal: boundary.endOrdinal,
          unit: boundary.unit,
        },
        inner: boundaryToExpression(boundary.range),
      };
    case "ordinal-day-in-range":
      return {
        kind: "select",
        select: { kind: "ordinal-day", day: boundary.day },
        inner: boundaryToExpression(boundary.range),
      };
    case "half-of-range":
      return {
        kind: "select",
        select: { kind: "half", half: boundary.half },
        inner: boundaryToExpression(boundary.range),
      };
    case "unique-weekday-in-range":
      return {
        kind: "select",
        select: { kind: "unique-weekday", weekday: boundary.weekday },
        inner: boundaryToExpression(boundary.range),
      };
    case "ordinal-weekday-in-range":
      return {
        kind: "select",
        select: { kind: "ordinal-weekday", ordinal: boundary.ordinal, weekday: boundary.weekday },
        inner: boundaryToExpression(boundary.range),
      };
    case "ordinal-day-group-in-range":
      return {
        kind: "select",
        select: { kind: "ordinal-day-group", ordinal: boundary.ordinal, group: boundary.group },
        inner: boundaryToExpression(boundary.range),
      };
    case "edge-count-unit-in-range":
      return {
        kind: "select",
        select: {
          kind: "edge-count-unit",
          edge: boundary.edge,
          count: boundary.count,
          unit: boundary.unit,
          skipHolidays: boundary.skipHolidays,
        },
        inner: boundaryToExpression(boundary.range),
      };
    default:
      return { kind: "scope", boundary };
  }
}
