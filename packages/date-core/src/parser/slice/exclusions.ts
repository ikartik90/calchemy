import type { ExclusionSlice } from "./types";

export type SplitExclusionsResult = {
  baseInput: string;
  exclusions: ExclusionSlice[];
};

export function splitExclusions(input: string): SplitExclusionsResult {
  const match = /(?:\s+|\.\s*)(?:excluding|skip|except) (.+)$/.exec(input);
  if (!match?.[1]) {
    return { baseInput: input, exclusions: [] };
  }

  return {
    baseInput: input.slice(0, match.index).trim(),
    exclusions: [{ input: match[1].trim() }],
  };
}
