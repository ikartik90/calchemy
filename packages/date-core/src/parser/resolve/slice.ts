import { applyTransforms } from "./transforms";
import { resolveExpression, type ResolveExpressionOptions } from "./expression";
import type { DateSlice } from "../expression/types";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type ResolveDateSliceOptions = ResolveExpressionOptions;

export function resolveDateSliceWithoutExclusions(
  slice: DateSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveDateSliceOptions,
): DateValue | null {
  const resolved = resolveExpression(
    slice.expression,
    anchorDate,
    Temporal,
    context,
    lookups,
    options,
  );
  if (!resolved) {
    return null;
  }

  return applyTransforms(resolved, slice.transforms);
}
