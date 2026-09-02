import { parseDayGroup, parsePeriod } from "../primitives/periods";
import {
  AlternatingSamplerCommandSet,
  SamplerParitySet,
  SamplerParityStartIndexMap,
  type SamplerCommand,
  type SamplerParity,
} from "../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type SamplerSlice =
  | { kind: "all-days"; interval: number; startIndex: number }
  | { kind: "day-number-parity"; parity: SamplerParity }
  | { kind: "weekdays"; weekdays: number[]; interval: number; startIndex: number }
  | { kind: "weeks"; interval: number; startIndex: number };

// Example: `sliceSampler("mondays", "all", lookups)` returns weekday sampler intent.
export function sliceSampler(input: string, command: SamplerCommand, lookups: DateVocabularyLookups): SamplerSlice | null {
  const dayNumberParity = parseDayNumberParity(input, lookups);
  if (dayNumberParity) {
    return dayNumberParity;
  }

  const occurrence = parseOccurrencePrefix(input);
  const samplerInput = occurrence?.input ?? input;
  const interval = command && AlternatingSamplerCommandSet.has(command) ? 2 : occurrence ? 2 : 1;
  const startIndex = occurrence ? (SamplerParityStartIndexMap.get(occurrence.parity) ?? 0) : 0;

  if (parseDayPeriod(samplerInput, lookups)) {
    return { kind: "all-days", interval, startIndex };
  }

  if (parseWeekPeriod(samplerInput, lookups) && (command || occurrence)) {
    return { kind: "weeks", interval, startIndex };
  }

  const weekdays = parseWeekdayList(samplerInput, lookups);
  if (weekdays.length > 0) {
    return {
      kind: "weekdays",
      weekdays,
      interval,
      startIndex,
    };
  }

  const dayGroup = parseDayGroup(samplerInput);
  if (dayGroup) {
    return {
      kind: "weekdays",
      weekdays: weekdaysForDayGroup(dayGroup),
      interval,
      startIndex,
    };
  }

  return null;
}

// Example: `parseDayNumberParity("even dates", lookups)` returns even day-of-month intent.
function parseDayNumberParity(input: string, lookups: DateVocabularyLookups): Extract<SamplerSlice, { kind: "day-number-parity" }> | null {
  const parityMatch = /^(.+?)(?: numbered)? (.+)$/.exec(input);
  if (!parityMatch?.[1] || !SamplerParitySet.has(parityMatch[1]) || !parityMatch[2] || !parseDayPeriod(parityMatch[2], lookups)) {
    return null;
  }

  return { kind: "day-number-parity", parity: parityMatch[1] as SamplerParity };
}

// Example: `parseDayPeriod("days", lookups)` accepts singular, plural, and date aliases.
function parseDayPeriod(input: string, lookups: DateVocabularyLookups): boolean {
  return parsePeriod(input) === "day" || lookups.durationUnits.get(input) === "day";
}

// Example: `parseWeekPeriod("weeks", lookups)` accepts singular, plural, and week aliases.
function parseWeekPeriod(input: string, lookups: DateVocabularyLookups): boolean {
  return parsePeriod(input) === "week" || lookups.durationUnits.get(input) === "week";
}

// Example: `parseOccurrencePrefix("even mondays")` returns even occurrence metadata for `mondays`.
function parseOccurrencePrefix(input: string): { parity: SamplerParity; input: string } | null {
  const match = /^(odd|even) (.+)$/u.exec(input);
  if (!match?.[1] || !SamplerParitySet.has(match[1]) || !match[2] || match[2].startsWith("numbered ")) {
    return null;
  }

  return { parity: match[1] as SamplerParity, input: match[2] };
}

// Example: `parseWeekdayList("monday-wednesday and friday", lookups)` returns `[1, 2, 3, 5]`.
function parseWeekdayList(input: string, lookups: DateVocabularyLookups): number[] {
  // Weekdays may be separated by whitespace, commas, and/or the connectors `and`/`or`
  // in any combination (`mon wed fri`, `mon, wed, fri`, `mon, wed and fri`), so split on
  // every separator and drop the connector words before looking each token up. A single
  // token may itself be an inclusive weekday range such as `mon-wed`.
  const tokens = input
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => value !== "" && value !== "and" && value !== "or");
  if (tokens.length === 0) {
    return [];
  }

  const weekdays: number[] = [];
  for (const token of tokens) {
    const expanded = parseWeekdayToken(token, lookups);
    if (expanded === null) {
      return [];
    }

    weekdays.push(...expanded);
  }

  return Array.from(new Set(weekdays));
}

// Example: `parseWeekdayToken("mon-wed", lookups)` returns `[1, 2, 3]`; `parseWeekdayToken("fri", lookups)` returns `[5]`.
function parseWeekdayToken(token: string, lookups: DateVocabularyLookups): number[] | null {
  const single = lookups.weekdays.get(token);
  if (single !== undefined) {
    return [single];
  }

  const range = /^([a-z]+)-([a-z]+)$/.exec(token);
  const start = range?.[1] ? lookups.weekdays.get(range[1]) : undefined;
  const end = range?.[2] ? lookups.weekdays.get(range[2]) : undefined;
  if (start === undefined || end === undefined) {
    return null;
  }

  return expandWeekdayRange(start, end);
}

// Example: `expandWeekdayRange(1, 3)` returns `[1, 2, 3]`; `expandWeekdayRange(6, 1)` wraps to `[6, 7, 1]`.
function expandWeekdayRange(start: number, end: number): number[] {
  const days: number[] = [];
  let cursor = start;
  for (let step = 0; step < 7; step += 1) {
    days.push(cursor);
    if (cursor === end) {
      break;
    }

    cursor = cursor === 7 ? 1 : cursor + 1;
  }

  return days;
}

// Example: `weekdaysForDayGroup("weekdays")` returns Monday through Friday indices.
function weekdaysForDayGroup(group: NonNullable<ReturnType<typeof parseDayGroup>>): number[] {
  return group === "weekend" ? [6, 7] : [1, 2, 3, 4, 5];
}
