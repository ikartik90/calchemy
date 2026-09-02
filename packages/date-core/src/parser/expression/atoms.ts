import { boundaryToExpression, isCompositionalBoundary } from "./from-slice";
import type { BoundaryEndpointSlice, BoundarySlice } from "../slice/types";
import type { DateExpression } from "./types";

/**
 * Collects the free-text atoms inside an expression, in reading order, so the
 * diagnostics layer can point at the first one the resolver cannot understand.
 *
 * Example: `collectAtomInputsFromExpression(sliceFor("next qzxwv"))` returns
 * `["next qzxwv"]`.
 */
export function collectAtomInputsFromExpression(expression: DateExpression): string[] {
  switch (expression.kind) {
    case "scope":
      return collectAtomInputs(expression.boundary);
    case "select":
    case "iterate":
    case "sample":
      return collectAtomInputsFromExpression(expression.inner);
  }
}

// A leaf's children may themselves be compositional, as in `end of first week
// of next month`; those are walked through the same lowering the resolver uses.
function collectAtomInputs(boundary: BoundarySlice): string[] {
  if (isCompositionalBoundary(boundary)) {
    return collectAtomInputsFromExpression(boundaryToExpression(boundary));
  }

  switch (boundary.kind) {
    case "atom":
      return [boundary.input];
    case "range":
      return [
        ...collectAtomInputsFromEndpoint(boundary.start),
        ...collectAtomInputsFromEndpoint(boundary.end),
      ];
    case "anchor-until":
      return collectAtomInputsFromEndpoint(boundary.end);
    case "boundary-side":
      return collectAtomInputs(boundary.boundary);
    case "duration-from-anchor":
    case "duration-near-boundary":
    case "ordinal-unit-from-anchor":
    case "ordinal-weekday-from-anchor":
    case "week-of-date":
      return collectAtomInputs(boundary.anchor);
    case "shifted-anchor":
      return [...collectAtomInputs(boundary.anchor), ...collectAtomInputs(boundary.range)];
    case "date-list":
      return boundary.items.flatMap((item) => collectAtomInputs(item));
    default:
      return [];
  }
}

function collectAtomInputsFromEndpoint(endpoint: BoundaryEndpointSlice): string[] {
  return collectAtomInputs(endpoint.boundary);
}
