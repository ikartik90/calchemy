import { applyExclusions } from "./exclusions";
import { applyRelations } from "./relations";
import { applySampler } from "./sampler";
import { applyTransforms } from "./transforms";
import { materializeDateValue } from "./materialize";
import { resolveBoundary } from "./boundary";
import type { DateSlice } from "../slice";
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
  const boundary = resolveBoundary(slice.boundary, anchorDate, Temporal, context, lookups);
  if (!boundary) {
    return null;
  }

  const related = applyRelations(boundary, slice.relation);
  if (!related) {
    return null;
  }

  const sampled = slice.sampler ? applySampler(related, slice.sampler) : related;
  if (!sampled) {
    return null;
  }

  const transformed = applyTransforms(sampled, slice.transforms);
  const filtered = applyExclusions(transformed, slice.exclusions, anchorDate, Temporal, context, lookups);
  return filtered ? materializeDateValue(filtered) : null;
}
