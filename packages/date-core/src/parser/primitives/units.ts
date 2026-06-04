import type { DurationUnit } from "../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `parseDurationUnit("wks", lookups)` returns `week` after alias normalization.
export function parseDurationUnit(input: string, lookups: DateVocabularyLookups): DurationUnit | null {
  return lookups.durationUnits.get(input) ?? null;
}
