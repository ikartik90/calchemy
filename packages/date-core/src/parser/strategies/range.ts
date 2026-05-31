import { parseDateAnchor } from "./anchors";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Parses ranges whose endpoints can be named, numeric, relative, or month-name dates.
export function parseRange(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const parts = parseRangeParts(input);
  if (!parts) {
    return null;
  }

  const [startInput, endInput] = parts;

  if (!startInput || !endInput) {
    return null;
  }

  const start = parseDateAnchor(startInput.trim(), anchorDate, Temporal, lookups, context);
  const end = parseDateAnchor(endInput.trim(), anchorDate, Temporal, lookups, context);

  if (!start || !end) {
    return null;
  }

  return { kind: "range", start, end };
}

// Splits a range into endpoint phrases without splitting inside numeric dates.
function parseRangeParts(input: string): [string, string] | null {
  const naturalRange = parseNaturalRangeParts(input);
  if (naturalRange) {
    return naturalRange;
  }

  const slashRange = parseSlashRangeParts(input);
  if (slashRange) {
    return slashRange;
  }

  return parseLegacyHyphenRangeParts(input);
}

function parseNaturalRangeParts(input: string): [string, string] | null {
  const fromToMatch = /^from (.+) to (.+)$/.exec(input);
  if (fromToMatch?.[1] && fromToMatch[2]) {
    return [fromToMatch[1], fromToMatch[2]];
  }

  const betweenMatch = /^between (.+) and (.+)$/.exec(input);
  if (betweenMatch?.[1] && betweenMatch[2]) {
    return [betweenMatch[1], betweenMatch[2]];
  }

  const toMatch = /^(.+) to (.+)$/.exec(input);
  if (toMatch?.[1] && toMatch[2]) {
    return [toMatch[1], toMatch[2]];
  }

  return null;
}

function parseSlashRangeParts(input: string): [string, string] | null {
  const isoDate = String.raw`\d{4}-\d{1,2}-\d{1,2}`;
  const match = new RegExp(`^(${isoDate})/(${isoDate})$`).exec(input);
  if (match?.[1] && match[2]) {
    return [match[1], match[2]];
  }

  return null;
}

function parseLegacyHyphenRangeParts(input: string): [string, string] | null {
  const parts = input.split("-");
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
}
