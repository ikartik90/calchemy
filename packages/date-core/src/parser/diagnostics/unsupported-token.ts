import { resolveBoundary } from "../resolve/boundary";
import { collectAtomInputsFromExpression } from "../expression/atoms";
import { levenshtein } from "../normalize";
import type { StandardChunk } from "../chunks";
import type { DateSlice } from "../expression/types";
import { GrammarWordSet, RecurrenceMarkerSet, RelativeModifierSet, type RelativeModifier } from "../types";
import { hasVocabularyLookupValue, type DateVocabularyLookups } from "../vocabulary";
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
    findFirstUnsupportedWordToken(chunks, input, lookups) ??
    findFirstUnresolvedAtomToken(slice, input, anchorDate, Temporal, context, lookups)
  );
}

/**
 * Locates the first run of words the parser has no meaning for.
 *
 * A word counts as known when it is grammar, vocabulary, a number, or part of
 * a configured named-date phrase *as it appears here*: `meeting` is known
 * inside `board meeting` and unknown on its own.
 *
 * Example: `findFirstUnsupportedWordToken(chunksFor("next qzxwv"), "next qzxwv", lookups)` points at `qzxwv`.
 */
export function findFirstUnsupportedWordToken(
  chunks: readonly StandardChunk[],
  input: string,
  lookups: DateVocabularyLookups,
): Token | undefined {
  const covered = findNamedDatePhraseCoverage(chunks, lookups);
  const unsupported = (index: number): boolean =>
    chunks[index]?.kind === "word" && !covered.has(index) && !isRecognizedWordAt(chunks, index, lookups);

  let index = 0;
  while (index < chunks.length && !unsupported(index)) {
    index += 1;
  }

  if (index >= chunks.length) {
    return undefined;
  }

  const run: string[] = [];
  while (index < chunks.length && unsupported(index)) {
    run.push(chunks[index]!.token.normalized);
    index += 1;
  }

  return locateTextInInput(run.join(" "), input);
}

/**
 * Offers the closest known word for a typo the normalizer did not fix on its
 * own: it only corrects words of five letters or more, so `nxt` reaches the
 * parser untouched.
 *
 * Example: `findNearestKnownWord("nxt", lookups)` returns `next`.
 */
export function findNearestKnownWord(word: string, lookups: DateVocabularyLookups): string | null {
  // Two letters can be one edit away from almost anything (`at` → `sat`).
  if (word.length < 3 || /^\d+$/.test(word)) {
    return null;
  }

  // One edit is a slip of the finger at any length; two edits only mean the
  // same word when there are enough letters left to recognise it (`easter` is
  // not a misspelling of `after`).
  const limit = word.length >= 7 ? 2 : 1;
  const candidates = new Set<string>([
    ...GrammarWordSet,
    ...RelativeModifierSet,
    ...RecurrenceMarkerSet,
    ...lookups.fuzzyValues,
  ]);

  let best: { word: string; distance: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.length < 2 || candidate.includes(" ") || candidate === word) {
      continue;
    }

    const distance = levenshtein(word, candidate);
    if (distance <= limit && (!best || distance < best.distance)) {
      best = { word: candidate, distance };
    }
  }

  return best?.word ?? null;
}

// Example: `findNamedDatePhraseCoverage(chunksFor("board meeting in q3"), lookups)` returns `{0, 1}`.
function findNamedDatePhraseCoverage(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): Set<number> {
  const covered = new Set<number>();
  const maxWords = lookups.namedDatePhraseMaxWords;

  for (let start = 0; start < chunks.length; start += 1) {
    for (let length = Math.min(maxWords, chunks.length - start); length >= 1; length -= 1) {
      const phrase = chunks
        .slice(start, start + length)
        .map((chunk) => chunk.token.normalized)
        .join(" ");
      if (lookups.namedDatePhrases.has(phrase)) {
        for (let index = start; index < start + length; index += 1) {
          covered.add(index);
        }
        break;
      }
    }
  }

  return covered;
}

// Example: `isRecognizedWordAt(chunksFor("q3"), 0, lookups)` is true: `q` before a number is a quarter shorthand.
function isRecognizedWordAt(chunks: readonly StandardChunk[], index: number, lookups: DateVocabularyLookups): boolean {
  const chunk = chunks[index];
  if (chunk?.kind !== "word") {
    return true;
  }

  const value = chunk.value;
  const next = chunks[index + 1];
  const previous = chunks[index - 1];

  if (/^\d+$/.test(value)) {
    return true;
  }

  if ((value === "q" || value === "w" || value === "m") && (next?.kind === "ordinal" || next?.kind === "number")) {
    return true;
  }

  if (value === "up" && next?.kind === "connector" && next.value === "to") {
    return true;
  }

  if (value === "other" && previous?.kind === "command" && previous.value === "every") {
    return true;
  }

  return (
    RelativeModifierSet.has(value as RelativeModifier) ||
    RecurrenceMarkerSet.has(value) ||
    GrammarWordSet.has(value as never) ||
    hasVocabularyLookupValue(value, lookups)
  );
}

export function findFirstUnresolvedAtomToken(
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

export function locateTextInInput(text: string, input: string): Token | undefined {
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
