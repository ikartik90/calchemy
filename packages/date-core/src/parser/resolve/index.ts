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

  const related = applyRelations(boundary);
  const transformed = applyTransforms(related);
  const sampled = slice.sampler ? applySampler(transformed, slice.sampler) : transformed;
  if (!sampled) {
    return null;
  }

  const filtered = applyExclusions(sampled, slice.exclusions, anchorDate, Temporal, context, lookups);
  return filtered ? materializeDateValue(filtered) : null;
}
