import { betweenBoundary, rawBoundary } from "./boundary";
import { sliceSampler } from "./sampler";
import { splitExclusions } from "./exclusions";
import type { DateSlice } from "./types";
import type { StandardChunk } from "../chunks";
import type { DateVocabularyLookups } from "../vocabulary";

type SamplerCommand = "all" | "alternate" | "every" | "every other" | "select" | undefined;

export function sliceDateExpression(
  input: string,
  _chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): DateSlice {
  const { baseInput, exclusions } = splitExclusions(input);

  const between = sliceWeekdayBetween(baseInput, exclusions, lookups);
  if (between) {
    return between;
  }

  const scoped = sliceScopedSampler(baseInput, exclusions, lookups);
  if (scoped) {
    return scoped;
  }

  return { boundary: rawBoundary(baseInput), exclusions, sampler: null };
}

function sliceWeekdayBetween(
  input: string,
  exclusions: DateSlice["exclusions"],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const match = /^(?:(select|all|every) )?(.+?) between (.+) and (.+)$/.exec(input);
  if (!match?.[2] || !match[3] || !match[4]) {
    return null;
  }

  const sampler = sliceSampler(match[2], parseCommand(match[1]), lookups);
  if (!sampler) {
    return null;
  }

  return {
    boundary: betweenBoundary(match[3], match[4]),
    exclusions,
    sampler,
  };
}

function sliceScopedSampler(
  input: string,
  exclusions: DateSlice["exclusions"],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const match = /^(?:(select|all|alternate|every other|every) )?(.+?) (?:for|during|in|from|of) (?:the )?(.+)$/.exec(input);
  if (!match?.[2] || !match[3]) {
    return null;
  }

  const sampler = sliceSampler(match[2], parseCommand(match[1]), lookups);
  if (!sampler) {
    return null;
  }

  return {
    boundary: rawBoundary(match[3]),
    exclusions,
    sampler,
  };
}

function parseCommand(input: string | undefined): SamplerCommand {
  return input === "select" ||
    input === "all" ||
    input === "alternate" ||
    input === "every other" ||
    input === "every"
    ? input
    : undefined;
}
