import { applyRelations } from "./relations";
import { applySampler } from "./sampler";
import { applyTransforms } from "./transforms";
import { resolveBoundary, type ResolveBoundaryOptions } from "./boundary";
import type { DateSlice } from "../slice";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type ResolveDateSliceOptions = ResolveBoundaryOptions;

// Example: `resolveDateSliceWithoutExclusions(slice, anchor, Temporal, context, lookups)` resolves boundary, relation, sampler, and transform intent.
export function resolveDateSliceWithoutExclusions(
  slice: DateSlice,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
  options?: ResolveDateSliceOptions,
): DateValue | null {
  const boundary = resolveBoundary(slice.boundary, anchorDate, Temporal, context, lookups, options);
  if (!boundary) {
    return null;
  }

  const related = applyRelations(boundary, slice.relation);
  if (!related) {
    return null;
  }

  const sampled = slice.sampler ? applySampler(related, slice.sampler, context.weekStartsOn) : related;
  if (!sampled) {
    return null;
  }

  return applyTransforms(sampled, slice.transforms);
}
