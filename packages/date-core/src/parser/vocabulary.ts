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
    addAliasEntries(aliases, entry.value, entry.shortcuts);
    addFuzzyEntries(fuzzyValues, entry.value, entry.shortcuts);
    months.set(entry.value, entry.month);
    for (const shortcut of entry.shortcuts) {
      months.set(shortcut, entry.month);
    }
  }

  for (const entry of vocabulary.weekdays) {
    addAliasEntries(aliases, entry.value, entry.shortcuts);
    addFuzzyEntries(fuzzyValues, entry.value, entry.shortcuts);
    weekdays.set(entry.value, entry.weekday);
  }

  for (const entry of vocabulary.relatives) {
    addAliasEntries(aliases, entry.value, entry.shortcuts ?? []);
    addFuzzyEntries(fuzzyValues, entry.value, entry.shortcuts ?? []);
    relativeValues.add(entry.value);
  }

  for (const entry of vocabulary.durationUnits) {
    addAliasEntries(aliases, entry.value, entry.shortcuts ?? []);
    addFuzzyEntries(fuzzyValues, entry.value, entry.shortcuts ?? []);
    durationUnits.set(entry.value, entry.unit);
  }

  for (const entry of vocabulary.recurrenceFrequencies) {
    addAliasEntries(aliases, entry.value, entry.shortcuts ?? []);
    addFuzzyEntries(fuzzyValues, entry.value, entry.shortcuts ?? []);
  }

  for (const entry of namedDates) {
    const value = normalizeVocabularyValue(entry.value);
    addAliasEntries(aliases, value, entry.shortcuts ?? []);
    addFuzzyEntries(fuzzyValues, value, entry.shortcuts ?? []);
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

// Example: `addAliasEntries(map, "january", ["jan"])` maps `jan` to `january`.
function addAliasEntries(aliases: Map<string, string>, value: string, shortcuts: readonly string[]): void {
  for (const shortcut of shortcuts) {
    aliases.set(normalizeVocabularyValue(shortcut), normalizeVocabularyValue(value));
  }
}

// Example: `addFuzzyEntries(values, "february", ["feb"])` marks words eligible for typo matching.
function addFuzzyEntries(values: Set<string>, value: string, shortcuts: readonly string[]): void {
  values.add(normalizeVocabularyValue(value));
  for (const shortcut of shortcuts) {
    values.add(normalizeVocabularyValue(shortcut));
  }
}

// Example: `normalizeVocabularyValue("  New Year  ")` returns `new year`.
export function normalizeVocabularyValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
