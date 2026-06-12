import { parseAmount } from "../primitives/numbers";
import { parseConnector } from "../primitives/connectors";
import { parseExclusionMarker } from "../primitives/exclusion-markers";
import { parseOrdinal } from "../primitives/numbers";
import { parsePeriod } from "../primitives/periods";
import { parseStructuralShorthand } from "../primitives/shorthands";
import {
  MultiTokenExclusionMarkerValues,
  SamplerChunkCommandValues,
} from "../types";
import type { StandardChunk } from "./types";
import type { Token } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `standardizeChunks(tokensFor("all mondays"), lookups)` emits command and weekday chunks.
export function standardizeChunks(tokens: readonly Token[], lookups: DateVocabularyLookups): StandardChunk[] {
  return standardizeExclusionMarkerChunks(
    standardizeCalendarRangeChunks(tokens.map((token) => standardizeToken(token, lookups))),
  );
}

// Example: `standardizeToken(monthToken("march"), lookups)` emits a month chunk with value `3`.
function standardizeToken(token: Token, lookups: DateVocabularyLookups): StandardChunk {
  if (token.kind === "separator") {
    return { kind: "separator", value: token.normalized, token };
  }

  const shorthand = parseStructuralShorthand(token.normalized);
  if (shorthand) {
    return { kind: "shorthand", value: shorthand, token, boundarySide: "start" };
  }

  const connector = parseConnector(token.normalized);
  if (connector) {
    return { kind: "connector", value: connector, token };
  }

  const exclusionMarker = parseExclusionMarker(token.normalized);
  if (exclusionMarker) {
    return { kind: "exclusion-marker", value: exclusionMarker, token };
  }

  const command = SamplerChunkCommandValues.find((value) => value === token.normalized);
  if (command) {
    return { kind: "command", value: command, token };
  }

  const weekday = lookups.weekdays.get(token.normalized);
  if (weekday) {
    return { kind: "weekday", value: weekday, token };
  }

  const month = lookups.months.get(token.normalized);
  if (month) {
    return { kind: "month", value: month, token };
  }

  const durationUnit = lookups.durationUnits.get(token.normalized);
  if (durationUnit) {
    return { kind: "duration-unit", value: durationUnit, token };
  }

  const period = parsePeriod(token.normalized);
  if (period) {
    return { kind: "period", value: period, token };
  }

  if (lookups.relatives.has(token.normalized as never)) {
    return { kind: "relative", value: token.normalized, token };
  }

  const ordinal = parseOrdinal(token.normalized);
  if (ordinal) {
    return { kind: "ordinal", value: ordinal, token };
  }

  const amount = parseAmount(token.normalized);
  if (amount) {
    return { kind: "number", value: amount, token };
  }

  return { kind: "word", value: token.normalized, token };
}

// Example: `standardizeExclusionMarkerChunks(chunksFor("other than weekends"))` emits an exclusion-marker chunk.
function standardizeExclusionMarkerChunks(chunks: readonly StandardChunk[]): StandardChunk[] {
  const standardized: StandardChunk[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const next = chunks[index + 1];
    const multiTokenMarker = MultiTokenExclusionMarkerValues.find((marker) => {
      const [first, second] = marker.split(" ");
      return chunk?.kind === "word" && chunk.value === first && next?.kind === "word" && next.value === second;
    });

    if (multiTokenMarker && chunk && next) {
      standardized.push({
        kind: "exclusion-marker",
        value: multiTokenMarker,
        token: {
          kind: "word",
          raw: `${chunk.token.raw} ${next.token.raw}`,
          normalized: multiTokenMarker,
          start: chunk.token.start,
          end: next.token.end,
        },
      });
      index += 1;
      continue;
    }

    if (chunk) {
      standardized.push(chunk);
    }
  }

  return standardized;
}

// Example: `standardizeCalendarRangeChunks(chunksFor("3rd quarter"))` emits a structural Q3 shorthand chunk.
function standardizeCalendarRangeChunks(chunks: readonly StandardChunk[]): StandardChunk[] {
  const standardized: StandardChunk[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const next = chunks[index + 1];
    const afterNext = chunks[index + 2];

    if (
      chunk?.kind === "ordinal" &&
      next?.kind === "duration-unit" &&
      next.value === "quarter" &&
      next.token.normalized === "quarter" &&
      chunk.value >= 1 &&
      chunk.value <= 4
    ) {
      if (shouldDeferQuarterShorthand(chunks[index + 2])) {
        standardized.push(chunk);
        continue;
      }

      standardized.push(
        createQuarterShorthandChunk(chunk.value, {
          kind: "word",
          raw: `${chunk.token.raw} ${next.token.raw}`,
          normalized: `q${chunk.value}`,
          start: chunk.token.start,
          end: next.token.end,
        }),
      );
      index += 1;
      continue;
    }

    if (
      chunk?.kind === "ordinal" &&
      next?.kind === "word" &&
      isOrdinalSuffix(next.value) &&
      afterNext?.kind === "duration-unit" &&
      afterNext.value === "quarter" &&
      afterNext.token.normalized === "quarter" &&
      chunk.value >= 1 &&
      chunk.value <= 4
    ) {
      if (shouldDeferQuarterShorthand(chunks[index + 3])) {
        standardized.push(chunk);
        continue;
      }

      standardized.push(
        createQuarterShorthandChunk(chunk.value, {
          kind: "word",
          raw: `${chunk.token.raw}${next.token.raw} ${afterNext.token.raw}`,
          normalized: `q${chunk.value}`,
          start: chunk.token.start,
          end: afterNext.token.end,
        }),
      );
      index += 2;
      continue;
    }

    if (chunk) {
      standardized.push(chunk);
    }
  }

  return standardized;
}

// Example: `isOrdinalSuffix("rd")` returns true.
function isOrdinalSuffix(value: string): boolean {
  return value === "st" || value === "nd" || value === "rd" || value === "th";
}

// Example: `shouldDeferQuarterShorthand(fromConnector)` returns true for `3rd quarter from july`.
function shouldDeferQuarterShorthand(afterQuarter: StandardChunk | undefined): boolean {
  return afterQuarter?.kind === "connector" && afterQuarter.value === "from";
}

// Example: `createQuarterShorthandChunk(3, token)` emits a structural Q3 shorthand chunk.
function createQuarterShorthandChunk(
  ordinal: number,
  token: Extract<StandardChunk, { kind: "word" }>["token"],
): Extract<StandardChunk, { kind: "shorthand" }> {
  return {
    kind: "shorthand",
    value: { kind: "quarter", ordinal },
    boundarySide: "start",
    token,
  };
}
