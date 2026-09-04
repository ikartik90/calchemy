import {
  anchorUntilBoundary,
  parseBoundary,
  parseBoundaryEndpoint as parseTypedBoundaryEndpoint,
  parseBoundaryRelationReference,
  parseOrdinalUnitFromAnchorBoundary,
  parseOrdinalWeekdayFromAnchorBoundary,
  rangeBoundary,
  relativeMonthBoundary,
} from "./boundary";
import { sliceSampler } from "./sampler";
import { parseDayGroup } from "../primitives/periods";
import { parseAmount, parseOrdinal } from "../primitives/numbers";
import {
  AlternatingSamplerCommandSet,
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
import { wrapExpression, boundaryToExpression } from "../expression/from-slice";
import type { DateSlice } from "../expression/types";
import { parseMonthDayListExpression, parseMonthDayRangeExpression } from "../primitives/month-day-list";
import { trimLeadingSeparators, trimTrailingSeparators, type StandardChunk } from "../chunks";
import type { DateVocabularyLookups } from "../vocabulary";
import type {
  BoundaryEndpointSlice,
  BoundarySlice,
  ExclusionSlice,
  RelationSlice,
  TransformSlice,
} from "./types";
import type { SamplerSlice, SliceSamplerOptions } from "./sampler";

// Example: `sliceDateExpression("all mondays in june", chunks, lookups)` returns boundary plus sampler intent.
export function sliceDateExpression(
  input: string,
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): DateSlice {
  const { baseChunks, exclusions } = splitExclusionsFromChunks(chunks, lookups);
  const { expressionChunks, transforms } = splitTransformsFromChunks(baseChunks, lookups);

  const trailingSampler = sliceTrailingSampler(expressionChunks, exclusions, transforms, lookups);
  if (trailingSampler) {
    return trailingSampler;
  }

  const weekdayInMonth = sliceWeekdayInMonth(expressionChunks, exclusions, transforms);
  if (weekdayInMonth) {
    return weekdayInMonth;
  }

  const relation = sliceWeekdayRelation(expressionChunks, exclusions, transforms, lookups);
  if (relation) {
    return relation;
  }

  const dayGroupRelation = sliceDayGroupRelation(expressionChunks, exclusions, transforms, lookups);
  if (dayGroupRelation) {
    return dayGroupRelation;
  }

  const ordinalUnitFromAnchor = sliceOrdinalUnitFromAnchor(expressionChunks, exclusions, transforms, lookups);
  if (ordinalUnitFromAnchor) {
    return ordinalUnitFromAnchor;
  }

  const until = sliceUntilSampler(expressionChunks, exclusions, transforms, lookups);
  if (until) {
    return until;
  }

  const ordinalInEachUntil = sliceOrdinalInEachUpperBound(expressionChunks, exclusions, transforms, lookups);
  if (ordinalInEachUntil) {
    return ordinalInEachUntil;
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

  const sampler = parseSamplerFromChunks(chunks.slice(0, betweenIndex), lookups, { namedSets: true });
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
      parseBoundary(chunkText(boundaryChunks.slice(0, andIndex)), lookups, { preferDay: true }),
      parseBoundary(chunkText(boundaryChunks.slice(andIndex + 1)), lookups, { preferDay: true }),
    ),
    exclusions,
    sampler,
    null,
    transforms,
  );
}

// Example: `sliceOrdinalUnitFromAnchor(chunksFor("ninth week from christmas"), [], [], lookups)` offsets an ordinal calendar unit from any anchor.
function sliceOrdinalUnitFromAnchor(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  if (findUpperBoundConnector(chunks)) {
    return null;
  }

  const fromIndex = findConnectorIndex(chunks, "from");
  if (fromIndex <= 0 || fromIndex >= chunks.length - 1) {
    return null;
  }

  const leftText = chunkText(trimLeadingArticle(chunks.slice(0, fromIndex)));
  const anchorText = chunkText(chunks.slice(fromIndex + 1));
  if (!leftText || !anchorText) {
    return null;
  }

  const combined = `${leftText} from ${anchorText}`;
  const boundary =
    parseOrdinalUnitFromAnchorBoundary(combined, lookups) ??
    parseOrdinalWeekdayFromAnchorBoundary(combined, lookups);
  return boundary?.kind === "ordinal-unit-from-anchor" || boundary?.kind === "ordinal-weekday-from-anchor"
    ? createSlice(boundary, exclusions, null, null, transforms)
    : null;
}

// Example: `sliceScopedSampler(chunksFor("tuesdays of next month"), [], [], lookups)` scopes a sampler to a boundary.
function sliceScopedSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const connectorIndex = findScopedSamplerConnectorIndex(chunks);
  if (connectorIndex > 0 && connectorIndex < chunks.length - 1) {
    const sampler = parseSamplerFromChunks(chunks.slice(0, connectorIndex), lookups, { namedSets: true });
    if (sampler) {
      const connector = chunks[connectorIndex];
      if (
        !(
          connector?.kind === "connector" &&
          connector.value === "of" &&
          connectorIndex === 1 &&
          chunks[0] &&
          (chunks[0].kind === "duration-unit" || chunks[0].kind === "period") &&
          chunks[0].value === "week"
        )
      ) {
        return createSlice(
          parseBoundary(chunkText(trimLeadingArticle(chunks.slice(connectorIndex + 1))), lookups),
          exclusions,
          sampler,
          null,
          transforms,
        );
      }
    }
  }

  return sliceImplicitScopedSampler(chunks, exclusions, transforms, lookups);
}

// Example: `sliceImplicitScopedSampler(chunksFor("monday and wednesday next month"), [], [], lookups)` scopes weekdays without an explicit preposition.
function sliceImplicitScopedSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  for (let split = chunks.length - 1; split >= 1; split -= 1) {
    const sampler = parseSamplerFromChunks(chunks.slice(0, split), lookups);
    if (!sampler) {
      continue;
    }

    const boundaryChunks = trimLeadingArticle(chunks.slice(split));
    if (boundaryChunks.length === 0) {
      continue;
    }

    const boundary = parseBoundary(chunkText(boundaryChunks), lookups);
    if (!isImplicitScopedSamplerBoundary(boundary)) {
      continue;
    }

    return createSlice(boundary, exclusions, sampler, null, transforms);
  }

  return null;
}

// Example: `isImplicitScopedSamplerBoundary({ kind: "relative", ... })` accepts calendar scopes such as `next month`.
function isImplicitScopedSamplerBoundary(boundary: BoundarySlice): boolean {
  switch (boundary.kind) {
    case "atom":
    case "shifted-anchor":
    case "duration-from-anchor":
    case "duration-near-boundary":
    case "ordinal-unit-from-anchor":
    case "ordinal-weekday-from-anchor":
    case "date-list":
    case "boundary-side":
      return false;
    default:
      return true;
  }
}

// Example: `sliceTrailingSampler(chunksFor("august all days"), [], [], lookups)` reads a sampler that
// follows its range the way `all days in august` is read. The range is whatever the rest of the
// grammar makes of the leading chunks, so `august 2020`, `next week`, `q3`, and `between aug 15 and
// sep 30` all take a trailing sampler.
function sliceTrailingSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  for (let split = 1; split < chunks.length; split += 1) {
    const rangeChunks = chunks.slice(0, split);
    if (!endsWithCalendarWord(rangeChunks)) {
      continue;
    }

    const samplerChunks = chunks.slice(split);
    if (isBareSingularWeekday(samplerChunks, lookups)) {
      continue;
    }

    const sampler = parseSamplerFromChunks(samplerChunks, lookups, { namedSets: true });
    if (!sampler) {
      continue;
    }

    // `next year board meeting` is the year phrase `board meeting next year`, which the
    // named-date primitive answers by asking the entry for that year; it is not a set
    // filtered against the whole of next year.
    if (isMembershipSampler(sampler) && isBareYearPhrase(chunkText(rangeChunks))) {
      continue;
    }

    const range = sliceDateExpression(chunkText(rangeChunks), rangeChunks, lookups);
    if (!isTrailingSamplerRange(range)) {
      continue;
    }

    return {
      expression: { kind: "sample", sampler, inner: range.expression },
      exclusions: [...exclusions],
      transforms: [...transforms],
    };
  }

  return null;
}

// Example: `isBareSingularWeekday(chunksFor("sunday"), lookups)` returns true; `chunksFor("sundays")`
// and `chunksFor("mon and wed")` return false. A lone singular weekday after a range names that
// range's weekday (`next week sunday`, `thursday before next week's sunday`), which the boundary
// grammar already reads, so it is not taken as a sampler. Normalization rewrites `sundays` to
// `sunday`, so the plural is only visible on the token's raw text.
function isBareSingularWeekday(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): boolean {
  const [only] = chunks;
  if (chunks.length !== 1 || only?.kind !== "weekday") {
    return false;
  }

  const typed = only.token.raw;
  const canonical = lookups.aliases.get(typed) ?? typed;
  return typed !== `${canonical}s`;
}

// Example: `endsWithCalendarWord(chunksFor("next month"))` and `chunksFor("august 2020")` return true;
// `chunksFor("thursday before next")` and `chunksFor("3rd")` return false, so a trailing weekday there
// keeps its relation or ordinal meaning. A bare digit token is a year or a day number (`sep 30`),
// while `3rd`, `third`, and `15th` are day-of-month claims that take no sampler.
function endsWithCalendarWord(chunks: readonly StandardChunk[]): boolean {
  const last = chunks[chunks.length - 1];
  switch (last?.kind) {
    case "month":
    case "duration-unit":
    case "period":
    case "relative":
    case "shorthand":
      return true;
    case "number":
    case "ordinal":
      return /^\d+$/.test(last.token.raw);
    default:
      return false;
  }
}

// Example: `isTrailingSamplerRange(sliceFor("august"))` returns true; a range that is already sampled,
// or a bare atom the grammar could not read, cannot take a trailing sampler.
function isTrailingSamplerRange(range: DateSlice): boolean {
  const { expression } = range;
  if (expression.kind === "sample") {
    return false;
  }

  return expression.kind !== "scope" || isImplicitScopedSamplerBoundary(expression.boundary);
}

// Example: `isMembershipSampler({ kind: "named-set", name: "board meeting" })` returns true.
function isMembershipSampler(sampler: SamplerSlice): boolean {
  return sampler.kind === "named-set" || sampler.kind === "holidays";
}

// Example: `isBareYearPhrase("next year")` and `isBareYearPhrase("2027")` return true; `isBareYearPhrase("q3")` does not.
function isBareYearPhrase(input: string): boolean {
  return /^(?:\d{4}|(?:this|next|last|previous) year)$/.test(input);
}

// Example: `sliceUntilSampler(chunksFor("all mon until end of next month"), [], [], lookups)` builds an anchor-until range.
function sliceUntilSampler(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const split = requireValidUpperBoundSplit(chunks);
  if (!split) {
    return null;
  }

  const sampler = parseSamplerFromChunks(split.leftChunks, lookups);
  const end = parseBoundaryEndpoint(split.rightChunks, lookups);
  return sampler && end ? createSlice(anchorUntilBoundary(end), exclusions, sampler, null, transforms) : null;
}

// Example: `sliceOrdinalInEachUpperBound(chunksFor("first week of every month until end of year"), [], [], lookups)` bounds ordinal-in-each selections with anchor-until.
function sliceOrdinalInEachUpperBound(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const split = requireValidUpperBoundSplit(chunks);
  if (!split) {
    return null;
  }

  const leftText = chunkText(trimLeadingArticle(split.leftChunks));
  const leftBoundary = parseBoundary(leftText, lookups);
  const end = parseBoundaryEndpoint(split.rightChunks, lookups);
  if (!end) {
    return null;
  }

  const bounded = patchEachUnitBoundaryWithAnchorUntil(leftBoundary, end);
  return bounded ? createSlice(bounded, exclusions, null, null, transforms) : null;
}

// Example: `patchEachUnitBoundaryWithAnchorUntil(firstWeekEachMonth, endOfYearEndpoint)` scopes each-unit selection from the anchor through the end endpoint.
function patchEachUnitBoundaryWithAnchorUntil(
  boundary: BoundarySlice,
  end: BoundaryEndpointSlice,
): BoundarySlice | null {
  switch (boundary.kind) {
    case "ordinal-calendar-unit":
    case "ordinal-calendar-unit-span":
    case "ordinal-weekday-in-range":
    case "ordinal-day-group-in-range":
    case "ordinal-day-in-range":
    case "edge-count-unit-in-range":
    case "half-of-range":
    case "unique-weekday-in-range":
      return boundary.range.kind === "each-unit"
        ? {
            ...boundary,
            range: {
              ...boundary.range,
              within: { kind: "anchor-until", end },
            },
          }
        : null;
    default:
      return null;
  }
}

// Example: `sliceUpperBoundRange(chunksFor("tomorrow until end of next month"), [], [], lookups)` composes a range.
function sliceUpperBoundRange(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const split = requireValidUpperBoundSplit(chunks);
  if (!split) {
    return null;
  }

  if (shouldDeferUpperBoundRange(chunks, split.upperBound.index, lookups)) {
    return null;
  }

  const startChunks = trimCommandAndArticle(split.leftChunks);
  const start = parseTypedBoundaryEndpoint(chunkText(startChunks), lookups, boundarySideFromChunks(startChunks) ?? "end", {
    preferDay: true,
  });
  const end = parseBoundaryEndpoint(split.rightChunks, lookups);
  return start && end ? createSlice({ kind: "range", start, end }, exclusions, null, null, transforms) : null;
}

// Example: `sliceScopedSamplerUpperBound(chunksFor("mondays from tomorrow up to march"), [], [], lookups)` samples a bounded range.
function sliceScopedSamplerUpperBound(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  const split = requireValidUpperBoundSplit(chunks);
  if (!split) {
    return null;
  }

  const scopeIndex = findScopedSamplerConnectorIndex(split.leftChunks);
  if (scopeIndex <= 0 || scopeIndex >= split.leftChunks.length - 1) {
    return null;
  }

  const sampler = parseSamplerFromChunks(split.leftChunks.slice(0, scopeIndex), lookups, { namedSets: true });
  if (!sampler) {
    return null;
  }

  const start = parseTypedBoundaryEndpoint(
    chunkText(trimLeadingArticle(split.leftChunks.slice(scopeIndex + 1))),
    lookups,
    "start",
    { preferDay: true },
  );
  const end = parseBoundaryEndpoint(split.rightChunks, lookups);
  return start && end ? createSlice({ kind: "range", start, end }, exclusions, sampler, null, transforms) : null;
}

// Example: `sliceWeekdayRelation(chunksFor("thursday before next weekend"), [], [], lookups)` builds relation intent.
function sliceWeekdayRelation(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  if (findUpperBoundConnector(chunks)) {
    return null;
  }

  const parsed = parseWeekdayRelation(chunks, lookups);
  return parsed ? createSlice(parsed.boundary, exclusions, null, parsed.relation, transforms) : null;
}

// Example: `sliceDayGroupRelation(chunksFor("weekend before christmas"), [], [], lookups)` builds day-group relation intent.
function sliceDayGroupRelation(
  chunks: readonly StandardChunk[],
  exclusions: readonly ExclusionSlice[],
  transforms: readonly TransformSlice[],
  lookups: DateVocabularyLookups,
): DateSlice | null {
  if (findUpperBoundConnector(chunks)) {
    return null;
  }

  const parsed = parseDayGroupRelation(chunks, lookups);
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

  const dayGroupRelation = parseDayGroupRelation(chunks, lookups);
  if (dayGroupRelation) {
    return {
      kind: "relation",
      boundary: dayGroupRelation.boundary,
      relation: dayGroupRelation.relation,
    };
  }

  const endOf = parseEndOfBoundary(chunks);
  if (endOf) {
    return parseTypedBoundaryEndpoint(chunkText(endOf), lookups, "end");
  }

  return parseTypedBoundaryEndpoint(chunkText(trimLeadingArticle(chunks)), lookups, "end", { preferDay: true });
}

// Example: `boundarySideFromChunks(chunksFor("q3"))` returns `start`.
function boundarySideFromChunks(chunks: readonly StandardChunk[]): BoundaryEndpointSide | undefined {
  const shorthand = chunks.find((chunk): chunk is Extract<StandardChunk, { kind: "shorthand" }> => chunk.kind === "shorthand" && Boolean(chunk.boundarySide));
  return shorthand?.boundarySide;
}

// Example: `parseWeekdayRelation(chunksFor("first monday after christmas"), lookups)` returns boundary plus relation.
function parseWeekdayRelation(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): { boundary: BoundarySlice; relation: RelationSlice } | null {
  const split = parseRelationSelectorSplit(chunks);
  if (!split) {
    return null;
  }

  const { relationIndex, selectorChunks } = split;
  const weekdayIndex = findLastChunkIndex(selectorChunks, (chunk) => chunk.kind === "weekday");
  if (weekdayIndex < 0) {
    return null;
  }

  const weekdayChunk = selectorChunks[weekdayIndex];
  if (weekdayChunk?.kind !== "weekday") {
    return null;
  }

  const ordinal = parseRelationOrdinal(selectorChunks, weekdayIndex);
  if (!ordinal) {
    return null;
  }

  return {
    boundary: parseRelationReferenceBoundary(chunks, relationIndex, lookups),
    relation: {
      kind: "weekday-near-boundary",
      direction: relationDirectionAt(chunks, relationIndex),
      ordinal,
      weekday: weekdayChunk.value,
    },
  };
}

// Example: `parseDayGroupRelation(chunksFor("weekend before christmas"), lookups)` returns boundary plus day-group relation.
function parseDayGroupRelation(
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
): { boundary: BoundarySlice; relation: RelationSlice } | null {
  const split = parseRelationSelectorSplit(chunks);
  if (!split) {
    return null;
  }

  const { relationIndex, selectorChunks } = split;
  const groupIndex = findLastChunkIndex(
    selectorChunks,
    (chunk) =>
      (chunk.kind === "duration-unit" || chunk.kind === "period") &&
      parseDayGroup(chunk.token.normalized) !== null,
  );
  if (groupIndex < 0) {
    return null;
  }

  const groupChunk = selectorChunks[groupIndex];
  const group =
    groupChunk && (groupChunk.kind === "duration-unit" || groupChunk.kind === "period")
      ? parseDayGroup(groupChunk.token.normalized)
      : null;
  if (!group) {
    return null;
  }

  const ordinal = parseRelationOrdinal(selectorChunks, groupIndex);
  if (!ordinal) {
    return null;
  }

  return {
    boundary: parseRelationReferenceBoundary(chunks, relationIndex, lookups),
    relation: {
      kind: "day-group-near-boundary",
      direction: relationDirectionAt(chunks, relationIndex),
      ordinal,
      group,
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

// Example: `parseExclusionsFromChunks(chunksFor("weekends and holidays"), lookups)` slices each exclusion through the main expression pipeline.
function parseExclusionsFromChunks(chunks: readonly StandardChunk[], lookups: DateVocabularyLookups): ExclusionSlice[] {
  if (parseMonthDayListExpression(chunks, lookups) || parseMonthDayRangeExpression(chunks, lookups)) {
    return [sliceDateExpression(chunkText(chunks), chunks, lookups)];
  }

  const whole = sliceDateExpression(chunkText(chunks), chunks, lookups);
  if (shouldKeepExclusionWhole(whole)) {
    return [whole];
  }

  const parts = splitListChunks(chunks);
  if (parts.length <= 1) {
    return [whole];
  }

  return parts.map((part) => sliceDateExpression(chunkText(part), part, lookups));
}

// Example: `shouldKeepExclusionWhole(sliceFor("second and third week of august"))` keeps an ordinal
// week span intact instead of splitting it on `and`. Only a bare free-text atom is safe to split.
function shouldKeepExclusionWhole(slice: DateSlice): boolean {
  const { expression } = slice;
  return expression.kind !== "scope" || expression.boundary.kind !== "atom";
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
function parseSamplerFromChunks(
  chunks: readonly StandardChunk[],
  lookups: DateVocabularyLookups,
  options: SliceSamplerOptions = {},
): ReturnType<typeof sliceSampler> {
  const { command, samplerChunks } = splitSamplerCommand(trimLeadingArticle(chunks));
  return sliceSampler(chunkText(samplerChunks), command, lookups, options);
}

// Example: `splitSamplerCommand(chunksFor("every other monday"))` returns command `every other` and sampler chunks.
function splitSamplerCommand(chunks: readonly StandardChunk[]): {
  command: SamplerCommand;
  samplerChunks: readonly StandardChunk[];
} {
  let trimmed = trimLeadingArticle(chunks);
  if (
    trimmed[0]?.kind === "command" &&
    trimmed[0].value === "every" &&
    trimmed[1]?.kind === "command" &&
    AlternatingSamplerCommandSet.has(trimmed[1].value)
  ) {
    trimmed = trimmed.slice(1);
  }

  const first = trimmed[0];
  if (first?.kind !== "command") {
    return { command: undefined, samplerChunks: trimmed };
  }

  const multiTokenCommand = MultiTokenSamplerCommandValues.find(
    (command) => command === `${first.value} ${trimmed[1]?.token.normalized}`,
  );
  if (multiTokenCommand) {
    return { command: multiTokenCommand, samplerChunks: trimCommandAndArticle(trimmed.slice(2)) };
  }

  return { command: first.value, samplerChunks: trimCommandAndArticle(trimmed.slice(1)) };
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
  sampler: SamplerSlice | null,
  relation: RelationSlice | null,
  transforms: readonly TransformSlice[],
): DateSlice {
  return {
    expression: wrapExpression(boundaryToExpression(boundary), sampler, relation),
    exclusions: [...exclusions],
    transforms: [...transforms],
  };
}

// Example: `findConnectorIndex(chunksFor("from today to tomorrow"), "to")` returns the `to` index.
function findConnectorIndex(chunks: readonly StandardChunk[], value: string): number {
  return chunks.findIndex((chunk) => chunk.kind === "connector" && chunk.value === value);
}

type UpperBoundSplit = {
  upperBound: { index: number; width: number };
  leftChunks: readonly StandardChunk[];
  rightChunks: readonly StandardChunk[];
};

// Example: `requireValidUpperBoundSplit(chunksFor("today until tomorrow"))` returns left and right phrase chunks.
function requireValidUpperBoundSplit(chunks: readonly StandardChunk[]): UpperBoundSplit | null {
  const upperBound = findUpperBoundConnector(chunks);
  if (!upperBound || upperBound.index <= 0 || upperBound.index + upperBound.width >= chunks.length) {
    return null;
  }

  return {
    upperBound,
    leftChunks: chunks.slice(0, upperBound.index),
    rightChunks: chunks.slice(upperBound.index + upperBound.width),
  };
}

// Example: `parseRelationSelectorSplit(chunksFor("monday after christmas"))` returns selector and connector chunks.
function parseRelationSelectorSplit(
  chunks: readonly StandardChunk[],
): { relationIndex: number; selectorChunks: readonly StandardChunk[] } | null {
  const relationIndex = parseRelationConnectorIndex(chunks);
  if (relationIndex === null) {
    return null;
  }

  return {
    relationIndex,
    selectorChunks: trimCommandAndArticle(chunks.slice(0, relationIndex)),
  };
}

// Example: `parseRelationConnectorIndex(chunksFor("monday after christmas"))` returns the connector index.
function parseRelationConnectorIndex(chunks: readonly StandardChunk[]): number | null {
  const relationIndex = chunks.findIndex(
    (chunk) =>
      chunk.kind === "connector" &&
      (chunk.value === "after" || chunk.value === "before" || chunk.value === "following" || chunk.value === "preceding"),
  );
  return relationIndex > 0 && relationIndex < chunks.length - 1 ? relationIndex : null;
}

// Example: `parseRelationOrdinal(selectorChunks, weekdayIndex)` returns `1` for `first monday`.
function parseRelationOrdinal(selectorChunks: readonly StandardChunk[], selectorEndIndex: number): number | null {
  const ordinalInput = chunkText(selectorChunks.slice(0, selectorEndIndex));
  const ordinal = ordinalInput ? parseOrdinal(ordinalInput) : 1;
  return ordinal || null;
}

// Example: `parseRelationReferenceBoundary(chunks, relationIndex, lookups)` resolves the reference boundary.
function parseRelationReferenceBoundary(
  chunks: readonly StandardChunk[],
  relationIndex: number,
  lookups: DateVocabularyLookups,
): BoundarySlice {
  const referenceChunks = trimLeadingArticle(chunks.slice(relationIndex + 1));
  const reference = parseEndOfBoundary(referenceChunks) ?? referenceChunks;
  return parseBoundary(chunkText(reference), lookups);
}

// Example: `relationDirectionAt(chunks, relationIndex)` returns `after` for `monday after christmas`.
function relationDirectionAt(chunks: readonly StandardChunk[], relationIndex: number): RelationDirection {
  return (chunks[relationIndex] as Extract<StandardChunk, { kind: "connector" }>).value as RelationDirection;
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
  while (
    (trimmed[0]?.kind === "command" || (trimmed[0]?.kind === "word" && trimmed[0].value === "the")) &&
    !isRecurrenceMarkerPrefix(trimmed)
  ) {
    trimmed = trimLeadingArticle(trimmed.slice(1));
  }
  return trimmed;
}

// Example: `isRecurrenceMarkerPrefix(chunksFor("every month"))` returns true so cadence markers are not stripped as sampler commands.
function isRecurrenceMarkerPrefix(chunks: readonly StandardChunk[]): boolean {
  const first = chunks[0];
  const second = chunks[1];
  const marker =
    first?.kind === "command" && first.value === "every"
      ? "every"
      : first?.kind === "word" && (first.value === "each" || first.value === "every")
        ? first.value
        : null;
  if (!marker || second?.kind !== "duration-unit") {
    return false;
  }

  return (
    second.value === "day" ||
    second.value === "week" ||
    second.value === "month" ||
    second.value === "quarter" ||
    second.value === "year"
  );
}

// Example: `trimLeadingArticle(chunksFor("the next month"))` returns chunks for `next month`.
function trimLeadingArticle(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  return chunks[0]?.kind === "word" && chunks[0].value === "the" ? chunks.slice(1) : chunks;
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
