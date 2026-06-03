import type { SamplerSlice } from "./types";
import type { DateVocabularyLookups } from "../vocabulary";

type SamplerCommand = "all" | "alternate" | "every" | "every other" | "select" | undefined;

export function sliceSampler(input: string, command: SamplerCommand, lookups: DateVocabularyLookups): SamplerSlice | null {
  const occurrence = parseOccurrencePrefix(input);
  const samplerInput = occurrence?.input ?? input;
  const interval = command === "alternate" || command === "every other" || occurrence ? 2 : 1;
  const startIndex = occurrence?.parity === "even" ? 1 : 0;

  if (samplerInput === "day" || samplerInput === "days") {
    return { kind: "all-days", interval, startIndex };
  }

  const parityMatch = /^(odd|even) numbered dates?$/.exec(samplerInput);
  if (parityMatch?.[1]) {
    return { kind: "day-number-parity", parity: parityMatch[1] as "odd" | "even" };
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

  return null;
}

function parseOccurrencePrefix(input: string): { parity: "odd" | "even"; input: string } | null {
  const match = /^(odd|even) (.+)$/.exec(input);
  if (!match?.[1] || !match[2] || match[2].startsWith("numbered ")) {
    return null;
  }

  return { parity: match[1] as "odd" | "even", input: match[2] };
}

function parseWeekdayList(input: string, lookups: DateVocabularyLookups): number[] {
  const values = input
    .split(/\s+(?:and|or)\s+|,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const weekdays = values.map((value) => lookups.weekdays.get(value));

  if (values.length === 0 || weekdays.some((value) => value === undefined)) {
    return [];
  }

  return Array.from(new Set(weekdays as number[]));
}
