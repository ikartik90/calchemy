import { findUnsupportedExpressionToken } from "./diagnostics";
import { normalizeInput } from "./normalize";
import { resolveDateSlice } from "./resolve";
import { sliceDateExpression, type DateSlice } from "./slice";
import { standardizeChunks, type StandardChunk } from "./chunks";
import {
  findNestedPastMonthDayYear,
  parseMonthDayListResult,
  parseMonthDayYearResult,
} from "./primitives/month-day-list";
import { parseNumericCandidates } from "./primitives/numeric-date";
import { createCandidate, labelDateValue } from "./primitives/shared";
import { createDateVocabulary, createDateVocabularyLookups, type DateVocabularyLookups } from "./vocabulary";
import { resolveHolidayProvider } from "../holidays";
import type { PlainDate, TemporalApi } from "../temporal/types";
import type {
  AmbiguousParseDateResult,
  Candidate,
  DateOrder,
  DateValue,
  NamedDatesVocabularyEntry,
  ParseDateContext,
  ParseDateResult,
  ResolvedParseDateContext,
} from "../types";

const DefaultDateOrderPreference: DateOrder[] = ["DMY", "MDY", "YMD"];

export type ParseDateWithTemporalOptions = {
  namedDatesVocabulary?: readonly NamedDatesVocabularyEntry[];
};

// Example: `parseDateWithTemporal("next friday", context, Temporal)` returns a structured parse result.
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
      warnings: [],
    };
  }

  const resolved = resolveContext(context, Temporal, vocabulary.namedDates ?? []);
  const anchorDate = resolved.referenceDate;
  const numericCandidates = parseNumericCandidates(normalized.normalized, resolved, Temporal, source);

  if (numericCandidates.length === 1 && numericCandidates[0]) {
    return {
      status: "valid",
      input,
      value: numericCandidates[0].value,
      candidates: [numericCandidates[0]],
      corrections: normalized.corrections,
      warnings: [],
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
      warnings: [],
    };
  }

  const monthDayListResult = parseMonthDayListResult(
    input,
    chunks,
    resolved,
    Temporal,
    lookups,
    source,
    normalized.corrections,
  );
  if (monthDayListResult) {
    return monthDayListResult;
  }

  const monthDayYearResult = parseMonthDayYearResult(
    input,
    chunks,
    resolved,
    Temporal,
    lookups,
    source,
    normalized.corrections,
  );
  if (monthDayYearResult) {
    return monthDayYearResult;
  }

  const ambiguousKnownExpression = parseKnownExpressionAmbiguity(
    input,
    normalized.normalized,
    anchorDate,
    resolved,
    Temporal,
    lookups,
    source,
  );
  if (ambiguousKnownExpression) {
    return ambiguousKnownExpression;
  }

  const parsed = parseKnownExpression(normalized.normalized, anchorDate, resolved, Temporal, lookups, chunks);

  if (!parsed.value) {
    const token = findUnsupportedExpressionToken(
      chunks,
      parsed.slice,
      input,
      anchorDate,
      Temporal,
      resolved,
      lookups,
    );

    return {
      status: "invalid",
      input,
      errors: [
        {
          code: "unsupported-expression",
          message: token
            ? `Calchemy does not understand "${token.raw}".`
            : "Calchemy does not understand this date phrase yet.",
          ...(token ? { token } : {}),
        },
      ],
      corrections: normalized.corrections,
      warnings: [],
    };
  }

  const candidate = createCandidate("best", parsed.value, 1, labelDateValue(parsed.value), source);

  return {
    status: "valid",
    input,
    value: parsed.value,
    candidates: [candidate],
    corrections: normalized.corrections,
    warnings: [],
  };
}

// Example: `resolveContext({}, Temporal)` fills parser defaults around the current reference date.
function resolveContext(
  context: ParseDateContext,
  Temporal: TemporalApi,
  namedDates: readonly NamedDatesVocabularyEntry[] = [],
): ResolvedParseDateContext {
  const referenceDate =
    context.referenceDate ?? Temporal.Now.plainDateISO(context.timeZone);

  const baseContext = {
    referenceDate,
    locale: context.locale ?? "en-US",
    weekStartsOn: context.weekStartsOn ?? 0,
    dateOrderPreference: normalizeDateOrderPreference(context.dateOrderPreference),
    lastNDaysIncludesToday: context.lastNDaysIncludesToday ?? true,
  };
  const holidays = resolveHolidayProvider(namedDates, baseContext);

  return holidays ? { ...baseContext, holidays } : baseContext;
}

// Example: `normalizeDateOrderPreference(["MDY", "MDY"])` returns a de-duplicated preference list.
function normalizeDateOrderPreference(value: DateOrder[] | undefined): DateOrder[] {
  if (!value || value.length === 0) {
    return DefaultDateOrderPreference;
  }

  return Array.from(new Set(value));
}

// Example: `parseKnownExpression("next month", anchor, context, Temporal, lookups, chunks)` resolves a non-numeric phrase.
function parseKnownExpression(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  chunks: readonly StandardChunk[] = [],
): { value: DateValue | null; slice: DateSlice } {
  const slice = sliceDateExpression(input, chunks, lookups);
  return {
    slice,
    value: resolveDateSlice(slice, anchorDate, Temporal, context, lookups),
  };
}

// Example: `parseKnownExpressionAmbiguity("every monday until 3/4/27", ...)` returns date-order candidates for the whole phrase.
function parseKnownExpressionAmbiguity(
  input: string,
  normalizedInput: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  source: Candidate["source"],
): AmbiguousParseDateResult | null {
  return (
    parseNestedNumericAmbiguity(input, normalizedInput, anchorDate, context, Temporal, lookups, source) ??
    parseNestedMonthDayYearAmbiguity(input, normalizedInput, anchorDate, context, Temporal, lookups, source)
  );
}

// Example: `parseNestedNumericAmbiguity("every monday until 3/4/27", ...)` returns date-order candidates.
function parseNestedNumericAmbiguity(
  input: string,
  normalizedInput: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  source: Candidate["source"],
): AmbiguousParseDateResult | null {
  const nestedNumeric = findNestedNumericDate(normalizedInput);
  if (!nestedNumeric) {
    return null;
  }

  const numericCandidates = parseNumericCandidates(nestedNumeric.value, context, Temporal, source);
  if (numericCandidates.length <= 1) {
    return null;
  }

  const candidates = numericCandidates.flatMap((numericCandidate) => {
    if (numericCandidate.value.kind !== "single") {
      return [];
    }

    const interpretedInput = replaceRange(
      normalizedInput,
      nestedNumeric.start,
      nestedNumeric.end,
      numericCandidate.value.date.toString(),
    );
    const normalized = normalizeInput(interpretedInput, lookups);
    const chunks = standardizeChunks(normalized.tokens, lookups);
    const parsed = parseKnownExpression(normalized.normalized, anchorDate, context, Temporal, lookups, chunks);

    return parsed.value
      ? [
          createCandidate(
            `nested-${numericCandidate.id}`,
            parsed.value,
            numericCandidate.confidence,
            labelDateValue(parsed.value),
            source,
            numericCandidate.explanation,
          ),
        ]
      : [];
  });

  if (candidates.length <= 1) {
    return null;
  }

  return {
    status: "ambiguous",
    input,
    candidates,
    ambiguityGroups: [
      {
        id: "date-order",
        kind: "date-order",
        message: "Which date order did you mean?",
        options: candidates.map((candidate) => ({
          id: candidate.id,
          label: candidate.explanation ?? candidate.label,
          candidateIds: [candidate.id],
        })),
      },
    ],
    corrections: source.corrections,
    warnings: [],
  };
}

// Example: `parseNestedMonthDayYearAmbiguity("second tuesday from april 15 until june", ...)` returns day-vs-year candidates.
function parseNestedMonthDayYearAmbiguity(
  input: string,
  normalizedInput: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  source: Candidate["source"],
): AmbiguousParseDateResult | null {
  const nested = findNestedPastMonthDayYear(normalizedInput, lookups, anchorDate.year);
  if (!nested) {
    return null;
  }

  const interpretations = [
    {
      id: "nested-month-day",
      replacement: `${nested.monthName} ${nested.day} ${anchorDate.year}`,
      confidence: 0.95,
    },
    {
      id: "nested-month-year",
      replacement: `${nested.monthName} ${nested.expandedYear}`,
      confidence: 0.85,
    },
  ];

  const candidates = interpretations.flatMap((interpretation) => {
    const interpretedInput = replaceRange(normalizedInput, nested.start, nested.end, interpretation.replacement);
    const normalized = normalizeInput(interpretedInput, lookups);
    const chunks = standardizeChunks(normalized.tokens, lookups);
    const parsed = parseKnownExpression(normalized.normalized, anchorDate, context, Temporal, lookups, chunks);

    return parsed.value
      ? [
          createCandidate(
            interpretation.id,
            parsed.value,
            interpretation.confidence,
            labelDateValue(parsed.value),
            source,
          ),
        ]
      : [];
  });

  if (candidates.length <= 1) {
    return null;
  }

  return {
    status: "ambiguous",
    input,
    candidates,
    ambiguityGroups: [
      {
        id: "month-day-year",
        kind: "month-day-year",
        message: "Did you mean a calendar day or a month and year?",
        options: candidates.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          candidateIds: [candidate.id],
        })),
      },
    ],
    corrections: source.corrections,
    warnings: [],
  };
}

// Example: `findNestedNumericDate("every monday until 3/4/27")` finds `3/4/27`.
function findNestedNumericDate(input: string): { value: string; start: number; end: number } | null {
  const match = /(?<!^)\b\d{1,4}([./-])\d{1,2}\1\d{2,4}\b/.exec(input);
  return match ? { value: match[0], start: match.index, end: match.index + match[0].length } : null;
}

// Example: `replaceRange("until 3/4/27", 6, 12, "2027-04-03")` returns an interpreted phrase.
function replaceRange(input: string, start: number, end: number, replacement: string): string {
  return `${input.slice(0, start)}${replacement}${input.slice(end)}`;
}
