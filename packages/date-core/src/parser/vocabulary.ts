import type {
  DateVocabulary,
  DurationUnitVocabularyEntry,
  NamedDatesVocabularyEntry,
  RelativeVocabularyEntry,
} from "../types";
import { DefaultDateVocabulary } from "./types";

export type DateVocabularyLookups = {
  aliases: Map<string, string>;
  fuzzyValues: readonly string[];
  months: Map<string, number>;
  weekdays: Map<string, number>;
  durationUnits: Map<string, DurationUnitVocabularyEntry["unit"]>;
  relatives: Set<RelativeVocabularyEntry["value"]>;
  namedDates: readonly NamedDatesVocabularyEntry[];
};

// Example: `createDateVocabulary([{ value: "christmas", ... }])` adds caller-provided named dates.
export function createDateVocabulary(namedDates: readonly NamedDatesVocabularyEntry[] = []): DateVocabulary {
  return {
    ...DefaultDateVocabulary,
    namedDates,
  };
}

// Example: `createDateVocabularyLookups(DefaultDateVocabulary)` builds alias and unit maps.
export function createDateVocabularyLookups(vocabulary: DateVocabulary): DateVocabularyLookups {
  const aliases = new Map<string, string>();
  const months = new Map<string, number>();
  const weekdays = new Map<string, number>();
  const durationUnits = new Map<string, DurationUnitVocabularyEntry["unit"]>();
  const relativeValues = new Set<RelativeVocabularyEntry["value"]>();
  const fuzzyValues = new Set<string>();
  const namedDates = vocabulary.namedDates ?? [];

  for (const entry of vocabulary.months) {
    addVocabularyAliasEntries(aliases, entry.value, entry.aliases);
    addFuzzyEntries(fuzzyValues, entry.value, entry.aliases);
    months.set(entry.value, entry.month);
    for (const alias of entry.aliases) {
      months.set(alias, entry.month);
    }
  }

  for (const entry of vocabulary.weekdays) {
    addVocabularyAliasEntries(aliases, entry.value, entry.aliases);
    addFuzzyEntries(fuzzyValues, entry.value, entry.aliases);
    weekdays.set(entry.value, entry.weekday);
  }

  for (const entry of vocabulary.relatives) {
    addVocabularyAliasEntries(aliases, entry.value, entry.aliases ?? []);
    addFuzzyEntries(fuzzyValues, entry.value, entry.aliases ?? []);
    relativeValues.add(entry.value);
  }

  for (const entry of vocabulary.durationUnits) {
    addFuzzyEntries(fuzzyValues, entry.value, []);
    durationUnits.set(entry.value, entry.unit);
  }

  for (const entry of vocabulary.recurrenceFrequencies) {
    addVocabularyAliasEntries(aliases, entry.value, entry.aliases ?? []);
    addFuzzyEntries(fuzzyValues, entry.value, entry.aliases ?? []);
  }

  for (const entry of namedDates) {
    const value = normalizeVocabularyValue(entry.value);
    addVocabularyAliasEntries(aliases, value, entry.aliases ?? []);
    addFuzzyEntries(fuzzyValues, value, entry.aliases ?? []);
  }

  return {
    aliases,
    fuzzyValues: Array.from(fuzzyValues),
    months,
    weekdays,
    durationUnits,
    relatives: relativeValues,
    namedDates,
  };
}

// Example: `addVocabularyAliasEntries(map, "january", ["jan"])` maps `jan` to `january`.
function addVocabularyAliasEntries(
  aliases: Map<string, string>,
  value: string,
  aliasEntries: readonly string[],
): void {
  for (const alias of aliasEntries) {
    aliases.set(normalizeVocabularyValue(alias), normalizeVocabularyValue(value));
  }
}

// Example: `addFuzzyEntries(values, "february", ["feb"])` marks words eligible for typo matching.
function addFuzzyEntries(values: Set<string>, value: string, aliasEntries: readonly string[]): void {
  values.add(normalizeVocabularyValue(value));
  for (const alias of aliasEntries) {
    values.add(normalizeVocabularyValue(alias));
  }
}

// Example: `normalizeVocabularyValue("  New Year  ")` returns `new year`.
export function normalizeVocabularyValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Example: `hasVocabularyLookupValue("february", lookups)` returns true for month vocabulary.
export function hasVocabularyLookupValue(value: string, lookups: DateVocabularyLookups): boolean {
  return (
    lookups.aliases.has(value) ||
    lookups.months.has(value) ||
    lookups.weekdays.has(value) ||
    lookups.durationUnits.has(value) ||
    lookups.relatives.has(value as RelativeVocabularyEntry["value"])
  );
}
