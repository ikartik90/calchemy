import type { DurationUnit } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export function parseDurationUnit(input: string, lookups: DateVocabularyLookups): DurationUnit | null {
  return lookups.durationUnits.get(input) ?? null;
}
