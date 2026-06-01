import type { DateValue, ParseDateResult, ValidParseDateResult } from "./types";

export type ExpectedDateValue = DateValue["kind"];

// Resolves a parse result against an expected output kind, including supported coercions.
export function resolveExpectedDateValue(result: ParseDateResult, expectedValue: ExpectedDateValue): ParseDateResult {
  if (result.status !== "valid") {
    return result;
  }

  const coercedValue = coerceExpectedDateValue(result.value, expectedValue);
  if (coercedValue) {
    return withResolvedValue(result, coercedValue);
  }

  if (result.value.kind !== expectedValue) {
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
    };
  }

  return result;
}

// Coerces colloquial range values to their first date when a single date result is requested.
export function coerceExpectedDateValue(value: DateValue, expectedValue: ExpectedDateValue): DateValue | null {
  if (expectedValue === "single" && value.kind === "range") {
    return { kind: "single", date: value.start };
  }

  return null;
}

function withResolvedValue(result: ValidParseDateResult, value: DateValue): ValidParseDateResult {
  return {
    ...result,
    value,
    candidates: result.candidates.map((candidate, index) => (index === 0 ? { ...candidate, value } : candidate)),
  };
}
