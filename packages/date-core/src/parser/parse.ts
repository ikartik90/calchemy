import { normalizeInput } from "./normalize";
import { resolveDateSlice } from "./resolve";
import { sliceDateExpression } from "./slice";
import { standardizeChunks, type StandardChunk } from "./chunks";
import { parseNumericCandidates } from "./primitives/numeric-date";
import { createCandidate, labelDateValue } from "./primitives/shared";
import { createDateVocabulary, createDateVocabularyLookups, type DateVocabularyLookups } from "./vocabulary";
import type { PlainDate, TemporalApi } from "../temporal/types";
import type {
  DateOrder,
  DateValue,
  NamedDatesVocabularyEntry,
  ParseDateContext,
  ParseDateResult,
  ResolvedParseDateContext,
} from "../types";

const DEFAULT_DATE_ORDER_PREFERENCE: DateOrder[] = ["DMY", "MDY", "YMD"];

export type ParseDateWithTemporalOptions = {
  namedDatesVocabulary?: readonly NamedDatesVocabularyEntry[];
};

export function parseDateWithTemporal(
  input: string,
  context: ParseDateContext,
  Temporal: TemporalApi,
  options: ParseDateWithTemporalOptions = {},
): ParseDateResult {
  const vocabulary = createDateVocabulary(options.namedDatesVocabulary);
  const lookups = createDateVocabularyLookups(vocabulary);
  const normalized = normalizeInput(input, lookups);
  const chunks = standardizeChunks(normalized.tokens, lookups);
  const source = {
    normalizedInput: normalized.normalized,
    tokens: normalized.tokens,
    corrections: normalized.corrections,
  };

  if (!input.trim()) {
    return {
      status: "invalid",
      input,
      errors: [{ code: "empty-input", message: "Enter a date phrase." }],
      corrections: normalized.corrections,
    };
  }

  const resolved = resolveContext(context, Temporal);
  const anchorDate = resolved.anchor.toPlainDate();
  const numericCandidates = parseNumericCandidates(normalized.normalized, resolved, Temporal, source);

  if (numericCandidates.length === 1 && numericCandidates[0]) {
    return {
      status: "valid",
      input,
      value: numericCandidates[0].value,
      candidates: [numericCandidates[0]],
      corrections: normalized.corrections,
    };
  }

  if (numericCandidates.length > 1) {
    return {
      status: "ambiguous",
      input,
      candidates: numericCandidates,
      ambiguityGroups: [
        {
          id: "date-order",
          kind: "date-order",
          message: "Which date order did you mean?",
          options: numericCandidates.map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
            candidateIds: [candidate.id],
          })),
        },
      ],
      corrections: normalized.corrections,
    };
  }

  const value = parseKnownExpression(normalized.normalized, anchorDate, resolved, Temporal, lookups, chunks);

  if (!value) {
    return {
      status: "invalid",
      input,
      errors: [{ code: "unsupported-expression", message: "Calchemy does not understand this date phrase yet." }],
      corrections: normalized.corrections,
    };
  }

  const candidate = createCandidate("best", value, 1, labelDateValue(value), source);

  return {
    status: "valid",
    input,
    value,
    candidates: [candidate],
    corrections: normalized.corrections,
  };
}

function resolveContext(context: ParseDateContext, Temporal: TemporalApi): ResolvedParseDateContext {
  const anchor = context.anchor ?? Temporal.Now.zonedDateTimeISO();

  return {
    anchor,
    locale: context.locale ?? "en-US",
    weekStartsOn: context.weekStartsOn ?? 0,
    dateOrderPreference: normalizeDateOrderPreference(context.dateOrderPreference),
    lastNDaysIncludesToday: context.lastNDaysIncludesToday ?? true,
    ...(context.holidays ? { holidays: context.holidays } : {}),
  };
}

function normalizeDateOrderPreference(value: DateOrder[] | undefined): DateOrder[] {
  if (!value || value.length === 0) {
    return DEFAULT_DATE_ORDER_PREFERENCE;
  }

  return Array.from(new Set(value));
}

function parseKnownExpression(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  chunks: readonly StandardChunk[] = [],
): DateValue | null {
  const slice = sliceDateExpression(input, chunks, lookups);
  return resolveDateSlice(slice, anchorDate, Temporal, context, lookups);
}
