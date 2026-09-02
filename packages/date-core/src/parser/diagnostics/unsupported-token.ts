import { resolveBoundary } from "../resolve/boundary";
import { collectAtomInputsFromExpression } from "../expression/atoms";
import type { StandardChunk } from "../chunks";
import type { DateSlice } from "../expression/types";
import { GrammarWordSet, RecurrenceMarkerSet, RelativeModifierSet, type RelativeModifier } from "../types";
import { hasVocabularyLookupValue, normalizeVocabularyValue, type DateVocabularyLookups } from "../vocabulary";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { ResolvedParseDateContext, Token } from "../../types";

export function findUnsupportedExpressionToken(
  chunks: readonly StandardChunk[],
  slice: DateSlice,
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): Token | undefined {
  return (
    findFirstUnsupportedWordSpan(chunks, input, lookups) ??
    findFirstUnresolvedAtomToken(slice, input, anchorDate, Temporal, context, lookups)
  );
}

function findFirstUnsupportedWordSpan(
  chunks: readonly StandardChunk[],
  input: string,
  lookups: DateVocabularyLookups,
): Token | undefined {
  let index = 0;
  while (index < chunks.length && !isUnsupportedWordChunk(chunks[index], lookups)) {
    index += 1;
  }

  if (index >= chunks.length) {
    return undefined;
  }

  const run: Extract<StandardChunk, { kind: "word" }>[] = [];
  while (index < chunks.length && isUnsupportedWordChunk(chunks[index], lookups)) {
    const chunk = chunks[index];
    if (chunk?.kind === "word") {
      run.push(chunk);
    }
    index += 1;
  }

  return locateTextInInput(run.map((chunk) => chunk.value).join(" "), input);
}

function isUnsupportedWordChunk(
  chunk: StandardChunk | undefined,
  lookups: DateVocabularyLookups,
): chunk is Extract<StandardChunk, { kind: "word" }> {
  if (chunk?.kind !== "word") {
    return false;
  }

  return !isRecognizedWordChunkValue(chunk.value, lookups);
}

function isRecognizedWordChunkValue(value: string, lookups: DateVocabularyLookups): boolean {
  return (
    RelativeModifierSet.has(value as RelativeModifier) ||
    RecurrenceMarkerSet.has(value) ||
    GrammarWordSet.has(value as never) ||
    hasVocabularyLookupValue(value, lookups) ||
    lookups.namedDates.some(
      (entry) =>
        normalizeVocabularyValue(entry.value) === value ||
        (entry.aliases ?? []).some((alias) => normalizeVocabularyValue(alias) === value),
    )
  );
}

function findFirstUnresolvedAtomToken(
  slice: DateSlice,
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): Token | undefined {
  for (const atomInput of collectAtomInputsFromSlice(slice)) {
    const resolved = resolveBoundary({ kind: "atom", input: atomInput }, anchorDate, Temporal, context, lookups);
    if (!resolved) {
      return locateTextInInput(atomInput, input);
    }
  }

  return undefined;
}

function collectAtomInputsFromSlice(slice: DateSlice): string[] {
  const atoms = collectAtomInputsFromExpression(slice.expression);
  for (const exclusion of slice.exclusions) {
    atoms.push(...collectAtomInputsFromSlice(exclusion));
  }
  return atoms;
}

function locateTextInInput(text: string, input: string): Token | undefined {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return undefined;
  }

  const haystack = input.toLowerCase();
  const start = haystack.indexOf(normalizedText);
  if (start < 0) {
    return undefined;
  }

  const end = start + normalizedText.length;
  return {
    kind: "word",
    raw: input.slice(start, end),
    normalized: normalizedText,
    start,
    end,
  };
}
