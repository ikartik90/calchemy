import type {
  DateVocabulary,
  DurationUnitVocabularyEntry,
  MonthVocabularyEntry,
  NamedDatesVocabularyEntry,
  RecurrenceFrequencyVocabularyEntry,
  RelativeVocabularyEntry,
  WeekdayVocabularyEntry,
} from "../types";

const MONTHS: readonly MonthVocabularyEntry[] = [
  { value: "january", shortcuts: ["jan"], month: 1 },
  { value: "february", shortcuts: ["feb"], month: 2 },
  { value: "march", shortcuts: ["mar"], month: 3 },
  { value: "april", shortcuts: ["apr"], month: 4 },
  { value: "may", shortcuts: [], month: 5 },
  { value: "june", shortcuts: ["jun"], month: 6 },
  { value: "july", shortcuts: ["jul"], month: 7 },
  { value: "august", shortcuts: ["aug"], month: 8 },
  { value: "september", shortcuts: ["sep", "sept"], month: 9 },
  { value: "october", shortcuts: ["oct"], month: 10 },
  { value: "november", shortcuts: ["nov"], month: 11 },
  { value: "december", shortcuts: ["dec"], month: 12 },
];

const WEEKDAYS: readonly WeekdayVocabularyEntry[] = [
  { value: "monday", shortcuts: ["mon", "mondays"], weekday: 1 },
  { value: "tuesday", shortcuts: ["tue", "tues", "tuesdays"], weekday: 2 },
  { value: "wednesday", shortcuts: ["wed", "wednesdays"], weekday: 3 },
  { value: "thursday", shortcuts: ["thu", "thur", "thurs", "thursdays"], weekday: 4 },
  { value: "friday", shortcuts: ["fri", "fridays"], weekday: 5 },
  { value: "saturday", shortcuts: ["sat", "saturdays"], weekday: 6 },
  { value: "sunday", shortcuts: ["sun", "sundays"], weekday: 7 },
];

const RELATIVES: readonly RelativeVocabularyEntry[] = [
  { value: "today" },
  { value: "tomorrow", shortcuts: ["tmr", "tmrw"] },
  { value: "yesterday" },
  { value: "now" },
];

const DURATION_UNITS: readonly DurationUnitVocabularyEntry[] = [
  { value: "day", unit: "day" },
  { value: "days", unit: "day" },
  { value: "week", shortcuts: ["wk"], unit: "week" },
  { value: "weeks", shortcuts: ["wks"], unit: "week" },
  { value: "month", unit: "month" },
  { value: "months", unit: "month" },
  { value: "year", shortcuts: ["yr"], unit: "year" },
  { value: "years", shortcuts: ["yrs"], unit: "year" },
];

const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequencyVocabularyEntry[] = [
  { value: "daily", cadence: { kind: "interval", every: { unit: "day", count: 1 } } },
  { value: "weekly", cadence: { kind: "interval", every: { unit: "week", count: 1 } } },
  { value: "fortnightly", cadence: { kind: "interval", every: { unit: "week", count: 2 } } },
  { value: "monthly", cadence: { kind: "interval", every: { unit: "month", count: 1 } } },
  { value: "yearly", cadence: { kind: "interval", every: { unit: "year", count: 1 } } },
];

export const DEFAULT_DATE_VOCABULARY: DateVocabulary = {
  months: MONTHS,
  weekdays: WEEKDAYS,
  relatives: RELATIVES,
  durationUnits: DURATION_UNITS,
  recurrenceFrequencies: RECURRENCE_FREQUENCIES,
};

export type DateVocabularyLookups = {
  aliases: Map<string, string>;
  fuzzyValues: readonly string[];
  months: Map<string, number>;
  weekdays: Map<string, number>;
  durationUnits: Map<string, DurationUnitVocabularyEntry["unit"]>;
  relatives: Set<RelativeVocabularyEntry["value"]>;
  namedDates: readonly NamedDatesVocabularyEntry[];
};

export function createDateVocabulary(namedDates: readonly NamedDatesVocabularyEntry[] = []): DateVocabulary {
  return {
    ...DEFAULT_DATE_VOCABULARY,
    namedDates,
  };
}

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

function addAliasEntries(aliases: Map<string, string>, value: string, shortcuts: readonly string[]): void {
  for (const shortcut of shortcuts) {
    aliases.set(normalizeVocabularyValue(shortcut), normalizeVocabularyValue(value));
  }
}

function addFuzzyEntries(values: Set<string>, value: string, shortcuts: readonly string[]): void {
  values.add(normalizeVocabularyValue(value));
  for (const shortcut of shortcuts) {
    values.add(normalizeVocabularyValue(shortcut));
  }
}

export function normalizeVocabularyValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
