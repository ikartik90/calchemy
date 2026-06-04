import { parseAmount } from "../primitives/numbers";
import { parseConnector } from "../primitives/connectors";
import { parseDurationUnit } from "../primitives/units";
import { parseOrdinal } from "../primitives/numbers";
import { parsePeriod } from "../primitives/periods";
import { parseStructuralShorthand } from "../primitives/shorthands";
import { ExclusionMarkerValues, SamplerChunkCommandValues } from "../types";
import type { StandardChunk } from "./types";
import type { Token } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Example: `standardizeChunks(tokensFor("all mondays"), lookups)` emits command and weekday chunks.
export function standardizeChunks(tokens: readonly Token[], lookups: DateVocabularyLookups): StandardChunk[] {
  return tokens.map((token) => standardizeToken(token, lookups));
}

// Example: `standardizeToken(monthToken("march"), lookups)` emits a month chunk with value `3`.
function standardizeToken(token: Token, lookups: DateVocabularyLookups): StandardChunk {
  if (token.kind === "separator") {
    return { kind: "separator", value: token.normalized, token };
  }

  const shorthand = parseStructuralShorthand(token.normalized);
  if (shorthand) {
    return { kind: "shorthand", value: shorthand, token };
  }

  const connector = parseConnector(token.normalized);
  if (connector) {
    return { kind: "connector", value: connector, token };
  }

  const exclusionMarker = ExclusionMarkerValues.find((value) => value === token.normalized);
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

  const durationUnit = parseDurationUnit(token.normalized, lookups);
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
