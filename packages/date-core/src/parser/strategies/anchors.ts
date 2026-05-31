import { parseNamedDate } from "./named-date";
import { parseNumericCandidates } from "./numeric";
import { parseRelativeDate, parseRelativeModifierExpression } from "./relative";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Resolves a phrase that can serve as a date anchor for other strategies.
export function parseDateAnchor(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): PlainDate | null {
  const relative = parseRelativeDate(input, anchorDate, lookups);
  if (relative) {
    return relative;
  }

  const relativeModifier = parseRelativeModifierExpression(input, anchorDate, context, lookups);
  if (relativeModifier?.kind === "single") {
    return relativeModifier.date;
  }

  const namedDate = parseNamedDate(input, anchorDate.year, Temporal, lookups, context);
  if (namedDate) {
    return namedDate;
  }

  const numericCandidates = parseNumericCandidates(input, context, Temporal, {
    normalizedInput: input,
    tokens: [],
    corrections: [],
  });
  if (numericCandidates[0]?.value.kind === "single") {
    return numericCandidates[0].value.date;
  }

  return null;
}
