import { applyExclusions } from "./exclusions";
import { materializeDateValue } from "./materialize";
import { resolveDateSliceWithoutExclusions } from "./slice";
import { findSamplerInExpression } from "../expression/sampler";
import type { DateSlice } from "../expression/types";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `resolveDateSlice(slice, anchor, Temporal, context, lookups)` resolves typed parser intent into a DateValue.
export function resolveDateSlice(
  slice: DateSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  const transformed = resolveDateSliceWithoutExclusions(slice, anchorDate, Temporal, context, lookups);
  if (!transformed) {
    return null;
  }

  const filtered = applyExclusions(transformed, slice.exclusions, anchorDate, Temporal, context, lookups, {
    sampler: findSamplerInExpression(slice.expression),
  });
  return filtered ? materializeDateValue(filtered) : null;
}
