import { resolveBoundary } from "./resolve/boundary";
import type { StandardChunk } from "./chunks";
import type { BoundaryEndpointSlice, BoundarySlice, DateSlice } from "./slice";
import { GrammarWordSet, RelativeModifierSet, type RelativeModifier } from "./types";
import { hasVocabularyLookupValue, normalizeVocabularyValue, type DateVocabularyLookups } from "./vocabulary";
import type { PlainDate, TemporalApi } from "../temporal/types";
import type { ResolvedParseDateContext, Token } from "../types";

// Example: `findUnsupportedExpressionToken(chunks, slice, input, ...)` returns the first unsupported phrase span.
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

// Example: `findFirstUnsupportedWordSpan(chunksFor("next qzxwv"), "next qzxwv", lookups)` returns a token for `qzxwv`.
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

// Example: `isUnsupportedWordChunk({ kind: "word", value: "qzxwv", ... }, lookups)` returns true for unknown words.
function isUnsupportedWordChunk(
  chunk: StandardChunk | undefined,
  lookups: DateVocabularyLookups,
): chunk is Extract<StandardChunk, { kind: "word" }> {
  if (chunk?.kind !== "word") {
    return false;
  }

  return !isRecognizedWordChunkValue(chunk.value, lookups);
}

// Example: `isRecognizedWordChunkValue("next", lookups)` returns true for relative modifiers kept as word chunks.
function isRecognizedWordChunkValue(value: string, lookups: DateVocabularyLookups): boolean {
  return (
    RelativeModifierSet.has(value as RelativeModifier) ||
    GrammarWordSet.has(value as never) ||
    hasVocabularyLookupValue(value, lookups) ||
    lookups.namedDates.some(
      (entry) =>
        normalizeVocabularyValue(entry.value) === value ||
        (entry.aliases ?? []).some((alias) => normalizeVocabularyValue(alias) === value),
    )
  );
}

// Example: `findFirstUnresolvedAtomToken(slice, "foobar tomorrow", ...)` returns a token when an atom boundary cannot resolve.
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

// Example: `collectAtomInputsFromSlice({ boundary: { kind: "atom", input: "foobar" }, ... })` returns `["foobar"]`.
function collectAtomInputsFromSlice(slice: DateSlice): string[] {
  const atoms = collectAtomInputs(slice.boundary);
  for (const exclusion of slice.exclusions) {
    atoms.push(...collectAtomInputsFromSlice(exclusion));
  }
  return atoms;
}

// Example: `collectAtomInputs({ kind: "range", start, end })` returns atom inputs from nested endpoints.
function collectAtomInputs(boundary: BoundarySlice): string[] {
  switch (boundary.kind) {
    case "atom":
      return [boundary.input];
    case "range":
      return [
        ...collectAtomInputsFromEndpoint(boundary.start),
        ...collectAtomInputsFromEndpoint(boundary.end),
      ];
    case "anchor-until":
      return collectAtomInputsFromEndpoint(boundary.end);
    case "boundary-side":
    case "duration-from-anchor":
    case "duration-near-boundary":
    case "ordinal-calendar-unit-span":
    case "ordinal-calendar-unit":
    case "ordinal-unit-from-anchor":
    case "ordinal-weekday-from-anchor":
    case "shifted-anchor":
    case "unique-weekday-in-range":
    case "ordinal-weekday-in-range":
    case "ordinal-day-group-in-range":
      return collectNestedBoundaryInputs(boundary);
    case "date-list":
      return boundary.items.flatMap((item) => collectAtomInputs(item));
    default:
      return [];
  }
}

function collectNestedBoundaryInputs(
  boundary: Extract<
    BoundarySlice,
    {
      kind:
        | "boundary-side"
        | "duration-from-anchor"
        | "duration-near-boundary"
        | "ordinal-calendar-unit-span"
        | "ordinal-calendar-unit"
        | "ordinal-unit-from-anchor"
        | "ordinal-weekday-from-anchor"
        | "shifted-anchor"
        | "unique-weekday-in-range"
        | "ordinal-weekday-in-range"
        | "ordinal-day-group-in-range";
    }
  >,
): string[] {
  switch (boundary.kind) {
    case "boundary-side":
      return collectAtomInputs(boundary.boundary);
    case "duration-from-anchor":
    case "duration-near-boundary":
    case "ordinal-unit-from-anchor":
    case "ordinal-weekday-from-anchor":
      return collectAtomInputs(boundary.anchor);
    case "ordinal-calendar-unit-span":
    case "ordinal-calendar-unit":
    case "unique-weekday-in-range":
    case "ordinal-weekday-in-range":
    case "ordinal-day-group-in-range":
      return collectAtomInputs(boundary.range);
    case "shifted-anchor":
      return [...collectAtomInputs(boundary.anchor), ...collectAtomInputs(boundary.range)];
    default:
      return [];
  }
}

function collectAtomInputsFromEndpoint(endpoint: BoundaryEndpointSlice): string[] {
  if (endpoint.kind === "relation") {
    return collectAtomInputs(endpoint.boundary);
  }

  return collectAtomInputs(endpoint.boundary);
}

// Example: `locateTextInInput("foobar", "Foobar tomorrow")` returns a token covering `Foobar`.
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
