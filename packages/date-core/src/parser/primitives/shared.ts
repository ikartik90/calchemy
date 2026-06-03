import { parseCardinalWords } from "./number-words";
import type { PlainDate } from "../../temporal/types";
import type { Candidate, DateValue, DurationUnit } from "../../types";

// Compares PlainDate values by their ISO calendar ordering.
export function comparePlainDate(left: PlainDate, right: PlainDate): number {
  return left.toString().localeCompare(right.toString());
}

// Creates a parse candidate with optional explanatory metadata.
export function createCandidate(
  id: string,
  value: DateValue,
  confidence: number,
  label: string,
  source: Candidate["source"],
  explanation?: string,
): Candidate {
  return {
    id,
    value,
    confidence,
    label,
    ...(explanation ? { explanation } : {}),
    source,
  };
}

// Produces a compact human-readable label for a parsed date value.
export function labelDateValue(value: DateValue): string {
  switch (value.kind) {
    case "single":
      return value.date.toString();
    case "range":
      return `${value.start.toString()} to ${value.end.toString()}`;
    case "multiple":
      return `${value.dates.length} dates`;
  }
}

// Parses a numeric or natural-language amount from a phrase.
export function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (Number.isFinite(Number(normalized))) {
    return Number(normalized);
  }

  return parseCardinalWords(normalized);
}

// Converts a count and parser duration unit into a Temporal duration-like object.
export function toDuration(amount: number, unit: DurationUnit | undefined): Record<string, number> {
  if (unit === "day") {
    return { days: amount };
  }

  if (unit === "week") {
    return { weeks: amount };
  }

  if (unit === "year") {
    return { years: amount };
  }

  return { months: amount };
}
