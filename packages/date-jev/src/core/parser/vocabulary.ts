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
  /**
   * Every named-date value and alias, normalized, mapped to its canonical
   * value. Names may span several words, so normalization matches them as
   * phrases (longest first) rather than word by word.
   */
  namedDatePhrases: Map<string, string>;
  namedDatePhraseMaxWords: number;
};

/**
 * Lookup tables are derived purely from a vocabulary and are never mutated
 * after construction, so they can be shared across parses.
 *
 * This matters because `parseDate` is called on every keystroke in a typing UI,
 * and inline completion can trigger a dozen parses per keystroke. Rebuilding
 * every map and set each time was pure waste.
 */
const lookupsByNamedDates = new WeakMap<object, DateVocabularyLookups>();
let defaultLookups: DateVocabularyLookups | undefined;

/**
 * Returns cached lookups for a named-dates vocabulary, building them on first
 * use.
 *
 * Caching is keyed on the identity of the `namedDates` array. Callers that hold
 * a stable array — as `createCalchemyWithTemporal` does — get the cache; callers
 * that build a fresh array per call still get correct results, just uncached.
 *
 * Example: `getDateVocabularyLookups()` returns the shared default lookups.
 */
export function getDateVocabularyLookups(
  namedDates: readonly NamedDatesVocabularyEntry[] = [],
): DateVocabularyLookups {
  if (namedDates.length === 0) {
    defaultLookups ??= createDateVocabularyLookups(createDateVocabulary());
    return defaultLookups;
  }

  const cached = lookupsByNamedDates.get(namedDates);
  if (cached) {
    return cached;
  }

  const lookups = createDateVocabularyLookups(createDateVocabulary(namedDates));
  lookupsByNamedDates.set(namedDates, lookups);
  return lookups;
}

// Example: `createDateVocabulary([{ value: "christmas", ... }])` adds caller-provided named dates.
export function createDateVocabulary(namedDates: readonly NamedDatesVocabularyEntry[] = []): DateVocabulary {
  assertNamedDatesVocabulary(namedDates);

  return {
    ...DefaultDateVocabulary,
    namedDates,
  };
}

/**
 * Rejects malformed `namedDatesVocabulary` entries at the point of
 * configuration.
 *
 * This is caller-supplied configuration rather than user input, so a bad entry
 * is a programmer mistake and throwing is correct. Validating here keeps the
 * failure legible: without it, a missing `value` surfaces much later as
 * `Cannot read properties of undefined (reading 'trim')` from deep inside
 * lookup construction.
 *
 * Example: `assertNamedDatesVocabulary([{ aliases: ["xmas"] }])` throws naming
 * entry 0 and the missing `value` field.
 */
function assertNamedDatesVocabulary(entries: readonly NamedDatesVocabularyEntry[]): void {
  if (!Array.isArray(entries)) {
    throw new TypeError(
      `namedDatesVocabulary must be an array, received ${describeValue(entries)}.`,
    );
  }

  entries.forEach((entry, index) => {
    const at = `namedDatesVocabulary[${index}]`;

    if (typeof entry !== "object" || entry === null) {
      throw new TypeError(`${at} must be an object, received ${describeValue(entry)}.`);
    }

    if (typeof entry.value !== "string" || entry.value.trim() === "") {
      throw new TypeError(
        `${at}.value must be a non-empty string, received ${describeValue(entry.value)}.`,
      );
    }

    const hasResolveDate = entry.resolveDate !== undefined;
    const hasResolveDates = entry.resolveDates !== undefined;

    if (hasResolveDate && hasResolveDates) {
      throw new TypeError(
        `${at} must define either resolveDate or resolveDates, not both.`,
      );
    }

    if (!hasResolveDate && !hasResolveDates) {
      throw new TypeError(
        `${at}.resolveDate must be a function, received undefined. ` +
          `Provide resolveDate ({ year, context } → PlainDate | null) for one date a year, ` +
          `or resolveDates ({ year, context } → PlainDate[]) for several.`,
      );
    }

    if (hasResolveDate && typeof entry.resolveDate !== "function") {
      throw new TypeError(
        `${at}.resolveDate must be a function, received ${describeValue(entry.resolveDate)}. ` +
          `It receives { year, context } and returns a PlainDate or null.`,
      );
    }

    if (hasResolveDates && typeof entry.resolveDates !== "function") {
      throw new TypeError(
        `${at}.resolveDates must be a function, received ${describeValue(entry.resolveDates)}. ` +
          `It receives { year, context } and returns an array of PlainDate.`,
      );
    }

    if (entry.aliases !== undefined) {
      if (!Array.isArray(entry.aliases)) {
        throw new TypeError(
          `${at}.aliases must be an array of strings, received ${describeValue(entry.aliases)}.`,
        );
      }

      entry.aliases.forEach((alias: unknown, aliasIndex: number) => {
        if (typeof alias !== "string" || alias.trim() === "") {
          throw new TypeError(
            `${at}.aliases[${aliasIndex}] must be a non-empty string, received ${describeValue(alias)}.`,
          );
        }
      });
    }

    if (entry.isHoliday !== undefined && typeof entry.isHoliday !== "boolean") {
      throw new TypeError(
        `${at}.isHoliday must be a boolean, received ${describeValue(entry.isHoliday)}.`,
      );
    }
  });
}

// Example: `describeValue(undefined)` returns `undefined`; `describeValue("x")` returns `"x"` (quoted).
function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  return typeof value;
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
  const namedDatePhrases = new Map<string, string>();
  let namedDatePhraseMaxWords = 0;

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

    for (const phrase of [value, ...(entry.aliases ?? []).map(normalizeVocabularyValue)]) {
      namedDatePhrases.set(phrase, value);
      namedDatePhraseMaxWords = Math.max(namedDatePhraseMaxWords, phrase.split(" ").length);
    }
  }

  return {
    aliases,
    fuzzyValues: Array.from(fuzzyValues),
    months,
    weekdays,
    durationUnits,
    relatives: relativeValues,
    namedDates,
    namedDatePhrases,
    namedDatePhraseMaxWords,
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
