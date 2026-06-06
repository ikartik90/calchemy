import {
  anchorUntilBoundary,
  parseBoundary,
  parseBoundaryEndpoint as parseTypedBoundaryEndpoint,
  parseBoundaryRelationReference,
  rangeBoundary,
  relativeMonthBoundary,
} from "./boundary";
import { sliceSampler } from "./sampler";
import { parseAmount, parseOrdinal } from "../primitives/numbers";
import { parsePeriod } from "../primitives/periods";
import {
  DayGroupPeriodSet,
  BackwardRelativeModifierSet,
  MultiTokenSamplerCommandValues,
  RelativeModifierSet,
  TransformOperatorSet,
  type BoundaryEndpointSide,
  type RelationDirection,
  type RelativeModifier,
  type SamplerCommand,
  type TransformOperator,
} from "../types";
import type {
  BoundaryEndpointSlice,
  BoundarySlice,
  DateSlice,
  ExclusionSlice,
  RelationSlice,
  TransformSlice,
} from "./types";
import type { StandardChunk } from "../chunks";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `sliceDateExpression("all mondays in june", chunks, lookups)` returns boundary plus sampler intent.
export function sliceDateExpression(
  input: string,
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): DateSlice {
  const { baseChunks, exclusions } = splitExclusionsFromChunks(chunks, lookups);
  const { expressionChunks, transforms } = splitTransformsFromChunks(baseChunks, lookups);

  const weekdayInMonth = sliceWeekdayInMonth(expressionChunks, exclusions, transforms);
  if (weekdayInMonth) {
    return weekdayInMonth;
  }

  const relation = sliceWeekdayRelation(expressionChunks, exclusions, transforms, lookups);
  if (relation) {
    return relation;
  }

  const until = sliceUntilSampler(expressionChunks, exclusions, transforms, lookups);
  if (until) {
    return until;
  }

  const scopedUpperBound = sliceScopedSamplerUpperBound(expressionChunks, exclusions, transforms, lookups);
  if (scopedUpperBound) {
    return scopedUpperBound;
  }

  const upperBound = sliceUpperBoundRange(expressionChunks, exclusions, transforms, lookups);
  if (upperBound) {
    return upperBound;
  }

  const between = sliceWeekdayBetween(expressionChunks, exclusions, transforms, lookups);
  if (between) {
    return between;
  }

  const scoped = sliceScopedSampler(expressionChunks, exclusions, transforms, lookups);
  if (scoped) {
    return scoped;
  }

  return createSlice(parseBoundary(chunkText(trimCommandAndArticle(expressionChunks)) || input, lookups), exclusions, null, null, transforms);
}

// Example: `sliceWeekdayBetween(chunksFor("all mondays between today and next month"), [], [], lookups)` returns a sampled range.
function sliceWeekdayBetween(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const betweenIndex = findConnectorIndex(chunks, "between");
  if (betweenIndex <= 0) {
    return null;
  }

  const sampler = parseSamplerFromChunks(chunks.slice(0, betweenIndex), lookups);
  if (!sampler) {
    return null;
  }

  const boundaryChunks = chunks.slice(betweenIndex + 1);
  const andIndex = findConnectorIndex(boundaryChunks, "and");
  if (andIndex <= 0 || andIndex >= boundaryChunks.length - 1) {
    return null;
  }

  return createSlice(
    rangeBoundary(
      parseBoundary(chunkText(boundaryChunks.slice(0, andIndex)), lookups),
      parseBoundary(chunkText(boundaryChunks.slice(andIndex + 1)), lookups),
    ),
    exclusions,
    sampler,
    null,
    transforms,
  );
}

// Example: `sliceScopedSampler(chunksFor("tuesdays of next month"), [], [], lookups)` scopes a sampler to a boundary.
function sliceScopedSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const connectorIndex = chunks.findIndex(
    (chunk) =>
      chunk.kind === "connector" &&
      (chunk.value === "for" || chunk.value === "during" || chunk.value === "in" || chunk.value === "from" || chunk.value === "of"),
  );
  if (connectorIndex <= 0 || connectorIndex >= chunks.length - 1) {
    return null;
  }

  const sampler = parseSamplerFromChunks(chunks.slice(0, connectorIndex), lookups);
  if (!sampler) {
    return null;
  }

  return createSlice(parseBoundary(chunkText(trimLeadingArticle(chunks.slice(connectorIndex + 1))), lookups), exclusions, sampler, null, transforms);
}

// Example: `sliceUntilSampler(chunksFor("all mon until end of next month"), [], [], lookups)` builds an anchor-until range.
function sliceUntilSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const upperBound = findUpperBoundConnector(chunks);
  if (!upperBound || upperBound.index <= 0 || upperBound.index + upperBound.width >= chunks.length) {
    return null;
  }

  const sampler = parseSamplerFromChunks(chunks.slice(0, upperBound.index), lookups);
  const end = parseBoundaryEndpoint(chunks.slice(upperBound.index + upperBound.width), lookups);
  return sampler && end ? createSlice(anchorUntilBoundary(end), exclusions, sampler, null, transforms) : null;
}

// Example: `sliceUpperBoundRange(chunksFor("tomorrow until end of next month"), [], [], lookups)` composes a range.
function sliceUpperBoundRange(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const upperBound = findUpperBoundConnector(chunks);
  if (!upperBound || upperBound.index <= 0 || upperBound.index + upperBound.width >= chunks.length) {
    return null;
  }

  if (shouldDeferUpperBoundRange(chunks, upperBound.index, lookups)) {
    return null;
  }

  const startChunks = trimCommandAndArticle(chunks.slice(0, upperBound.index));
  const start = parseTypedBoundaryEndpoint(chunkText(startChunks), lookups, boundarySideFromChunks(startChunks) ?? "end");
  const end = parseBoundaryEndpoint(chunks.slice(upperBound.index + upperBound.width), lookups);
  return start && end ? createSlice({ kind: "range", start, end }, exclusions, null, null, transforms) : null;
}

// Example: `sliceScopedSamplerUpperBound(chunksFor("mondays from tomorrow up to march"), [], [], lookups)` samples a bounded range.
function sliceScopedSamplerUpperBound(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const upperBound = findUpperBoundConnector(chunks);
  if (!upperBound || upperBound.index <= 0 || upperBound.index + upperBound.width >= chunks.length) {
    return null;
  }

  const leftChunks = chunks.slice(0, upperBound.index);
  const scopeIndex = findScopedSamplerConnectorIndex(leftChunks);
  if (scopeIndex <= 0 || scopeIndex >= leftChunks.length - 1) {
    return null;
  }

  const sampler = parseSamplerFromChunks(leftChunks.slice(0, scopeIndex), lookups);
  if (!sampler) {
    return null;
  }

  const start = parseTypedBoundaryEndpoint(chunkText(trimLeadingArticle(leftChunks.slice(scopeIndex + 1))), lookups, "start");
  const end = parseBoundaryEndpoint(chunks.slice(upperBound.index + upperBound.width), lookups);
  return start && end ? createSlice({ kind: "range", start, end }, exclusions, sampler, null, transforms) : null;
}

// Example: `sliceWeekdayRelation(chunksFor("thursday before next weekend"), [], [], lookups)` builds relation intent.
function sliceWeekdayRelation(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const parsed = parseWeekdayRelation(chunks, lookups);
  return parsed ? createSlice(parsed.boundary, exclusions, null, parsed.relation, transforms) : null;
}

// Example: `sliceWeekdayInMonth(chunksFor("next monday in march"), [], [])` selects a weekday inside a relative month.
function sliceWeekdayInMonth(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
): DateSlice | null {
  const expressionChunks = trimCommandAndArticle(chunks);
  const modifier =
    expressionChunks[0]?.kind === "relative" || expressionChunks[0]?.kind === "word"
      ? parseRelativeMonthModifier(expressionChunks[0].value)
      : null;
  const weekday = expressionChunks[1]?.kind === "weekday" ? expressionChunks[1].value : null;
  const connector = expressionChunks[2];
  const month = expressionChunks[3]?.kind === "month" ? expressionChunks[3].value : null;

  if (!modifier || !weekday || !month || connector?.kind !== "connector" || (connector.value !== "in" && connector.value !== "of")) {
    return null;
  }

  const placement = BackwardRelativeModifierSet.has(modifier) ? "last" : "first";
  return createSlice(
    relativeMonthBoundary(month, modifier),
    exclusions,
    null,
    { kind: "weekday-in-boundary", placement, weekday },
    transforms,
  );
}

// Example: `parseBoundaryEndpoint(chunksFor("end of next month"), lookups)` returns an end-side endpoint.
function parseBoundaryEndpoint(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): BoundaryEndpointSlice | null {
  const relationReference = parseBoundaryRelationReference(chunkText(chunks), lookups);
  if (relationReference) {
    return relationReference;
  }

  const relation = parseWeekdayRelation(chunks, lookups);
  if (relation) {
    return { kind: "relation", boundary: relation.boundary, relation: relation.relation };
  }

  const endOf = parseEndOfBoundary(chunks);
  if (endOf) {
    return parseTypedBoundaryEndpoint(chunkText(endOf), lookups, "end");
  }

  return parseTypedBoundaryEndpoint(chunkText(trimLeadingArticle(chunks)), lookups, "end");
}

// Example: `boundarySideFromChunks(chunksFor("q3"))` returns `start`.
function boundarySideFromChunks(chunks: readonly StandardChunk[]): BoundaryEndpointSide | undefined {
  const shorthand = chunks.find((chunk): chunk is Extract<StandardChunk, { kind: "shorthand" }> => chunk.kind === "shorthand" && Boolean(chunk.boundarySide));
  return shorthand?.boundarySide;
}

// Example: `parseWeekdayRelation(chunksFor("first monday after christmas"), lookups)` returns boundary plus relation.
function parseWeekdayRelation(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): { boundary: BoundarySlice; relation: RelationSlice } | null {
  const relationIndex = chunks.findIndex(
    (chunk) =>
      chunk.kind === "connector" &&
      (chunk.value === "after" || chunk.value === "before" || chunk.value === "following" || chunk.value === "preceding"),
  );
  if (relationIndex <= 0 || relationIndex >= chunks.length - 1) {
    return null;
  }

  const selectorChunks = trimCommandAndArticle(chunks.slice(0, relationIndex));
  const weekdayIndex = findLastChunkIndex(selectorChunks, (chunk) => chunk.kind === "weekday");
  if (weekdayIndex < 0) {
    return null;
  }

  const weekdayChunk = selectorChunks[weekdayIndex];
  if (weekdayChunk?.kind !== "weekday") {
    return null;
  }

  const ordinalInput = chunkText(selectorChunks.slice(0, weekdayIndex));
  const ordinal = ordinalInput ? parseOrdinal(ordinalInput) : 1;
  if (!ordinal) {
    return null;
  }

  const referenceChunks = trimLeadingArticle(chunks.slice(relationIndex + 1));
  const reference = parseEndOfBoundary(referenceChunks) ?? referenceChunks;

  return {
    boundary: parseBoundary(chunkText(reference), lookups),
    relation: {
      kind: "weekday-near-boundary",
      direction: (chunks[relationIndex] as Extract<StandardChunk, { kind: "connector" }>).value as RelationDirection,
      ordinal,
      weekday: weekdayChunk.value,
    },
  };
}

// Example: `splitExclusionsFromChunks(chunksFor("next month excluding weekends"), lookups)` separates exclusions.
function splitExclusionsFromChunks(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): {
  baseChunks: readonly StandardChunk[];
  exclusions: ExclusionSlice[];
} {
  const exclusionIndex = chunks.findIndex((chunk) => chunk.kind === "exclusion-marker");
  if (exclusionIndex < 0) {
    return { baseChunks: chunks, exclusions: [] };
  }

  return {
    baseChunks: trimTrailingSeparators(chunks.slice(0, exclusionIndex)),
    exclusions: parseExclusionsFromChunks(trimLeadingSeparators(chunks.slice(exclusionIndex + 1)), lookups),
  };
}

// Example: `parseExclusionsFromChunks(chunksFor("weekends and holidays"), lookups)` returns typed exclusions.
function parseExclusionsFromChunks(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): ExclusionSlice[] {
  const parts = splitListChunks(chunks);
  return parts.map((part) => parseExclusionFromChunks(part, lookups));
}

// Example: `parseExclusionFromChunks(chunksFor("2027"), lookups)` returns a year exclusion.
function parseExclusionFromChunks(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): ExclusionSlice {
  const input = chunkText(chunks);
  if (input === "holidays") {
    return { kind: "holidays" };
  }

  const dayGroup = parsePeriod(input);
  if (dayGroup && DayGroupPeriodSet.has(dayGroup)) {
    return { kind: dayGroup === "weekend" ? "weekends" : "weekdays" };
  }

  const monthValues = chunks.map((chunk) => (chunk.kind === "month" ? chunk.value : undefined));
  if (monthValues.length > 0 && monthValues.every((value) => value !== undefined)) {
    return { kind: "months", months: Array.from(new Set(monthValues as number[])) };
  }

  const yearValues = chunks.map((chunk) => (/^\d{4}$/.test(chunk.token.normalized) ? Number(chunk.token.normalized) : undefined));
  if (yearValues.length > 0 && yearValues.every((value) => value !== undefined)) {
    return { kind: "years", years: Array.from(new Set(yearValues as number[])) };
  }

  return { kind: "boundary", boundary: parseBoundary(input, lookups) };
}

// Example: `splitListChunks(chunksFor("weekends and holidays"))` splits list items around connectors.
function splitListChunks(chunks: readonly StandardChunk[]): ReadonlyArray<readonly StandardChunk[]> {
  const parts: StandardChunk[][] = [[]];
  for (const chunk of chunks) {
    const isSeparator = chunk.kind === "separator" && chunk.value === ",";
    const isListConnector = chunk.kind === "connector" && (chunk.value === "and" || chunk.value === "or");
    if (isSeparator || isListConnector) {
      parts.push([]);
      continue;
    }

    parts[parts.length - 1]?.push(chunk);
  }

  return parts.map((part) => trimLeadingSeparators(trimTrailingSeparators(part))).filter((part) => part.length > 0);
}

// Example: `splitTransformsFromChunks(chunksFor("today plus 2 weeks"), lookups)` separates offset transforms.
function splitTransformsFromChunks(
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): { expressionChunks: readonly StandardChunk[]; transforms: TransformSlice[] } {
  const operatorIndex = findTrailingTransformOperatorIndex(chunks);
  if (operatorIndex < 0) {
    return { expressionChunks: chunks, transforms: [] };
  }

  const operatorChunk = chunks[operatorIndex];
  const durationUnitIndex = chunks.findIndex((chunk, index) => index > operatorIndex && chunk.kind === "duration-unit");
  const amount = parseAmount(chunkText(chunks.slice(operatorIndex + 1, durationUnitIndex)));
  const unitChunk = chunks[durationUnitIndex];
  if (!amount || unitChunk?.kind !== "duration-unit" || !lookups.durationUnits) {
    return { expressionChunks: chunks, transforms: [] };
  }

  const operator =
    operatorChunk?.kind === "connector" && TransformOperatorSet.has(operatorChunk.value)
      ? (operatorChunk.value as TransformOperator)
      : "minus";
  return {
    expressionChunks: trimTrailingSeparators(chunks.slice(0, operatorIndex)),
    transforms: [{ amount, operator, unit: unitChunk.value }],
  };
}

// Example: `findTrailingTransformOperatorIndex(chunksFor("today minus 3 days"))` returns the minus index.
function findTrailingTransformOperatorIndex(chunks: readonly StandardChunk[]): number {
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    const isOperator = (chunk?.kind === "connector" && TransformOperatorSet.has(chunk.value)) || (chunk?.kind === "separator" && chunk.value === "-");
    if (!isOperator) {
      continue;
    }

    if (chunks.some((candidate, candidateIndex) => candidateIndex > index && candidate.kind === "duration-unit")) {
      return index;
    }
  }

  return -1;
}

// Example: `parseSamplerFromChunks(chunksFor("every other monday"), lookups)` returns alternate Monday intent.
function parseSamplerFromChunks(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): ReturnType<typeof sliceSampler> {
  const { command, samplerChunks } = splitSamplerCommand(trimLeadingArticle(chunks));
  return sliceSampler(chunkText(samplerChunks), command, lookups);
}

// Example: `splitSamplerCommand(chunksFor("every other monday"))` returns command `every other` and sampler chunks.
function splitSamplerCommand(chunks: readonly StandardChunk[]): {
  command: SamplerCommand;
  samplerChunks: readonly StandardChunk[];
} {
  const first = chunks[0];
  if (first?.kind !== "command") {
    return { command: undefined, samplerChunks: chunks };
  }

  const multiTokenCommand = MultiTokenSamplerCommandValues.find((command) => command === `${first.value} ${chunks[1]?.token.normalized}`);
  if (multiTokenCommand) {
    return { command: multiTokenCommand, samplerChunks: trimCommandAndArticle(chunks.slice(2)) };
  }

  return { command: first.value, samplerChunks: trimCommandAndArticle(chunks.slice(1)) };
}

// Example: `parseEndOfBoundary(chunksFor("end of next month"))` returns chunks for `next month`.
function parseEndOfBoundary(chunks: readonly StandardChunk[]): readonly StandardChunk[] | null {
  const normalized = trimLeadingArticle(chunks);
  const [first, second, third, ...rest] = normalized;
  if (first?.kind === "word" && first.value === "end" && second?.kind === "connector" && second.value === "of") {
    return trimLeadingArticle([third, ...rest].filter((chunk): chunk is StandardChunk => Boolean(chunk)));
  }

  return null;
}

// Example: `parseRelativeMonthModifier("previous")` returns `previous`.
function parseRelativeMonthModifier(value: string): RelativeModifier | null {
  return RelativeModifierSet.has(value as RelativeModifier) ? (value as RelativeModifier) : null;
}

// Example: `createSlice(boundary, exclusions, sampler, relation, transforms)` builds a DateSlice.
function createSlice(
  boundary: BoundarySlice,
  exclusions: readonly ExclusionSlice[],
  sampler: DateSlice["sampler"],
  relation: RelationSlice | null,
  transforms: readonly TransformSlice[],
): DateSlice {
  return {
    boundary,
    exclusions: [...exclusions],
    relation,
    sampler,
    transforms: [...transforms],
  };
}

// Example: `findConnectorIndex(chunksFor("from today to tomorrow"), "to")` returns the `to` index.
function findConnectorIndex(chunks: readonly StandardChunk[], value: string): number {
  return chunks.findIndex((chunk) => chunk.kind === "connector" && chunk.value === value);
}

// Example: `findUpperBoundConnector(chunksFor("today up to tomorrow"))` finds the `up to` connector.
function findUpperBoundConnector(chunks: readonly StandardChunk[]): { index: number; width: number } | null {
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk?.kind === "connector" && (chunk.value === "until" || chunk.value === "to")) {
      return { index, width: 1 };
    }

    const next = chunks[index + 1];
    if (chunk?.kind === "word" && chunk.value === "up" && next?.kind === "connector" && next.value === "to") {
      return { index, width: 2 };
    }
  }

  return null;
}

// Example: `shouldDeferUpperBoundRange(chunksFor("from christmas to july"), 2, lookups)` preserves existing range parsing.
function shouldDeferUpperBoundRange(chunks: readonly StandardChunk[], upperBoundIndex: number, lookups: DateVocabularyLookups): boolean {
  const first = chunks[0];
  if (first?.kind === "connector" && first.value === "from") {
    return true;
  }

  const scopedConnectorIndex = findScopedSamplerConnectorIndex(chunks.slice(0, upperBoundIndex));
  return scopedConnectorIndex > 0 && Boolean(parseSamplerFromChunks(chunks.slice(0, scopedConnectorIndex), lookups));
}

// Example: `findScopedSamplerConnectorIndex(chunksFor("mondays from june"))` returns the `from` index.
function findScopedSamplerConnectorIndex(chunks: readonly StandardChunk[]): number {
  return chunks.findIndex(
    (chunk) =>
      chunk.kind === "connector" &&
      (chunk.value === "for" || chunk.value === "during" || chunk.value === "in" || chunk.value === "from" || chunk.value === "of"),
  );
}

// Example: `findLastChunkIndex(chunks, isWeekdayChunk)` returns the last matching index.
function findLastChunkIndex(chunks: readonly StandardChunk[], predicate: (chunk: StandardChunk) => boolean): number {
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    if (chunk && predicate(chunk)) {
      return index;
    }
  }

  return -1;
}

// Example: `trimCommandAndArticle(chunksFor("select the mondays"))` returns chunks for `mondays`.
function trimCommandAndArticle(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  let trimmed = trimLeadingArticle(chunks);
  while (trimmed[0]?.kind === "command" || (trimmed[0]?.kind === "word" && trimmed[0].value === "the")) {
    trimmed = trimLeadingArticle(trimmed.slice(1));
  }
  return trimmed;
}

// Example: `trimLeadingArticle(chunksFor("the next month"))` returns chunks for `next month`.
function trimLeadingArticle(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  return chunks[0]?.kind === "word" && chunks[0].value === "the" ? chunks.slice(1) : chunks;
}

// Example: `trimLeadingSeparators(chunksFor(", weekends"))` removes leading separators.
function trimLeadingSeparators(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  let start = 0;
  while (chunks[start]?.kind === "separator") {
    start += 1;
  }
  return chunks.slice(start);
}

// Example: `trimTrailingSeparators(chunksFor("next month,"))` removes trailing separators.
function trimTrailingSeparators(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  let end = chunks.length;
  while (chunks[end - 1]?.kind === "separator") {
    end -= 1;
  }
  return chunks.slice(0, end);
}

// Example: `chunkText(chunksFor("q 4"))` returns normalized phrase text `q4`.
function chunkText(chunks: readonly StandardChunk[]): string {
  return chunks
    .map((chunk) => (chunk.kind === "shorthand" ? `${chunk.value.kind[0]}${chunk.value.ordinal}` : chunk.token.normalized))
    .join(" ")
    .replace(/\b([mqw]) (\d+)/g, "$1$2")
    .replace(/\s+([,./])\s*/g, "$1")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
