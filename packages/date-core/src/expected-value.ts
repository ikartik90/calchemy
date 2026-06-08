import type { PlainDate } from "./temporal/types";
import type { DateValue, ParseDateWarning, ParseDateResult, ValidParseDateResult } from "./types";

export type ExpectedDateValue = DateValue["kind"];

export const defaultMultipleRangeExpansionLimit = 1095;

export type ResolveExpectedDateValueOptions = {
  multipleRangeExpansionLimit?: number;
};

// Resolves a parse result against an expected output kind, including supported coercions.
export function resolveExpectedDateValue(
  result: ParseDateResult,
  expectedValue: ExpectedDateValue,
  options: ResolveExpectedDateValueOptions = {},
): ParseDateResult {
  if (result.status !== "valid") {
    return result;
  }

  const resolved = coerceExpectedDateValue(result.value, expectedValue, options);
  if (resolved) {
    return withResolvedValue(result, resolved.value, resolved.warnings);
  }

  return {
    status: "invalid",
    input: result.input,
    errors: [
      {
        code: "unexpected-value-kind",
        message: `Expected a ${expectedValue} date result, but parser returned ${result.value.kind}.`,
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
): { value: DateValue; warnings: ParseDateWarning[] } | null {
  if (value.kind === expectedValue) {
    return { value, warnings: [] };
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
