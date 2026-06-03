import type { DateVocabularyLookups } from "../vocabulary";

export function resolveAlias(input: string, lookups: DateVocabularyLookups): string | null {
  return lookups.aliases.get(input) ?? null;
}
