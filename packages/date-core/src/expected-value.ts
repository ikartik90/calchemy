import type { DateValue, ParseDateResult, ValidParseDateResult } from "./types";
import { parseAmount } from "./parser/primitives/numbers";
import { toDuration } from "./parser/primitives/shared";
import type { DurationUnit } from "./types";

export type ExpectedDateValue = DateValue["kind"];

// Resolves a parse result against an expected output kind, including supported coercions.
export function resolveExpectedDateValue(result: ParseDateResult, expectedValue: ExpectedDateValue): ParseDateResult {
  if (result.status !== "valid") {
    return result;
  }

  const coercedValue = coerceExpectedDateValue(result.value, expectedValue, result.input);
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
export function coerceExpectedDateValue(value: DateValue, expectedValue: ExpectedDateValue, input?: string): DateValue | null {
  if (expectedValue === "single" && value.kind === "range") {
    return { kind: "single", date: value.start };
  }

  if (expectedValue === "range" && value.kind === "single") {
    const duration = input ? parseFromNowDuration(input) : null;
    return duration ? { kind: "range", start: value.date.subtract(duration), end: value.date } : null;
  }

  return null;
}

function parseFromNowDuration(input: string): Record<string, number> | null {
  const match = /^(.+) ([a-z]+) from now$/i.exec(input.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const amount = parseAmount(match[1]);
  const unit = parseDurationUnit(match[2]);
  return amount && unit ? toDuration(amount, unit) : null;
}

function parseDurationUnit(input: string): DurationUnit | null {
  if (input === "day" || input === "days") {
    return "day";
  }

  if (input === "week" || input === "weeks" || input === "wk" || input === "wks") {
    return "week";
  }

  if (input === "month" || input === "months") {
    return "month";
  }

  if (input === "year" || input === "years" || input === "yr" || input === "yrs") {
    return "year";
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
