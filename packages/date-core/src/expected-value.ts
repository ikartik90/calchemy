import type { PlainDate } from "./temporal/types";
import type { DateValue, ParseDateWarning, ParseDateResult, ValidParseDateResult } from "./types";

export type ExpectedDateValue = DateValue["kind"];

export const defaultMultipleRangeExpansionLimit = 1095;

export type ResolveExpectedDateValueOptions = {
  multipleRangeExpansionLimit?: number;
};

const ValueKindLabels: Record<ExpectedDateValue, string> = {
  single: "a single date",
  range: "one continuous range",
  multiple: "a list of dates",
};

// Example: `describeUnexpectedValueKind("next 10 weekdays", "multiple", "range")` explains why the list cannot become a range.
function describeUnexpectedValueKind(input: string, actual: ExpectedDateValue, expected: ExpectedDateValue): string {
  const lead = `"${input}" gives ${ValueKindLabels[actual]}, but ${ValueKindLabels[expected]} was expected.`;
  if (actual === "multiple" && expected === "range") {
    return `${lead} The dates have gaps between them, so they cannot be joined into one range.`;
  }

  if (actual === "multiple" && expected === "single") {
    return `${lead} Pick one of the dates, or ask for a phrase that names exactly one day.`;
  }

  if (actual === "range" && expected === "single") {
    return `${lead} Ask for one end of it, for example "start of" or "end of" the same phrase.`;
  }

  return lead;
}

// Resolves a parse result against an expected output kind, including supported coercions.
export function resolveExpectedDateValue(
  result: ParseDateResult,
  expectedValue: ExpectedDateValue,
  options: ResolveExpectedDateValueOptions = {},
): ParseDateResult {
  if (result.status !== "valid") {
    return result;
  }

  const resolved = coerceExpectedDateValue(result.value, expectedValue, options, result.input);
  if (resolved) {
    return withResolvedValue(result, resolved.value, resolved.warnings);
  }

  return {
    status: "invalid",
    input: result.input,
    errors: [
      {
        code: "unexpected-value-kind",
        message: describeUnexpectedValueKind(result.input, result.value.kind, expectedValue),
      },
    ],
    corrections: result.corrections,
    warnings: result.warnings,
  };
}

export function coerceExpectedDateValue(
  value: DateValue,
  expectedValue: ExpectedDateValue,
  options: ResolveExpectedDateValueOptions = {},
  input?: string,
): { value: DateValue; warnings: ParseDateWarning[] } | null {
  if (value.kind === expectedValue) {
    return { value, warnings: [] };
  }

  if (expectedValue === "single" && value.kind === "range" && input && isDurationFromAnchorInput(input)) {
    return { value: { kind: "single", date: value.end }, warnings: [] };
  }

  if (expectedValue !== "multiple") {
    return null;
  }

  if (value.kind === "single") {
    return { value: { kind: "multiple", dates: [value.date] }, warnings: [] };
  }

  if (value.kind === "range") {
    return expandRangeToMultiple(value.start, value.end, getMultipleRangeExpansionLimit(options));
  }

  return { value, warnings: [] };
}

function expandRangeToMultiple(
  start: PlainDate,
  end: PlainDate,
  limit: number,
): { value: DateValue; warnings: ParseDateWarning[] } {
  const total = start.until(end, { largestUnit: "days" }).days + 1;
  const count = Math.min(total, limit);
  const dates = Array.from({ length: count }, (_, index) => start.add({ days: index }));
  const warnings =
    total > limit
      ? [
          {
            code: "maximum-selectable-dates-exceeded",
            message: `Exceeded maximum selectable dates. Showing the first ${limit} dates.`,
            limit,
            total,
          } satisfies ParseDateWarning,
        ]
      : [];

  return {
    value: { kind: "multiple", dates },
    warnings,
  };
}

function getMultipleRangeExpansionLimit(options: ResolveExpectedDateValueOptions): number {
  const limit = options.multipleRangeExpansionLimit ?? defaultMultipleRangeExpansionLimit;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("multipleRangeExpansionLimit must be a positive integer.");
  }

  return limit;
}

function isDurationFromAnchorInput(input: string): boolean {
  return /^.+ [a-z]+ from (?!now$).+$/i.test(input.trim());
}

function withResolvedValue(
  result: ValidParseDateResult,
  value: DateValue,
  warnings: ParseDateWarning[],
): ValidParseDateResult {
  return {
    ...result,
    value,
    candidates: result.candidates.map((candidate, index) => (index === 0 ? { ...candidate, value } : candidate)),
    warnings: [...result.warnings, ...warnings],
  };
}
