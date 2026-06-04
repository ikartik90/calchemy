import type { PlainDate } from "../../temporal/types";
import type { Candidate, DateValue } from "../../types";
import type { DurationUnit } from "../types";

// Example: `comparePlainDate(2026-01-01, 2026-01-02)` returns a negative number.
export function comparePlainDate(left: PlainDate, right: PlainDate): number {
  return left.toString().localeCompare(right.toString());
}

// Example: `createCandidate("best", value, 1, "2026-01-01", source)` creates a ranked parse candidate.
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

// Example: `labelDateValue({ kind: "multiple", dates })` returns `N dates`.
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

// Example: `toDuration(3, "week")` returns `{ weeks: 3 }`.
export function toDuration(amount: number, unit: DurationUnit | undefined): Record<string, number> {
  if (unit === "day") {
    return { days: amount };
  }

  if (unit === "weekdays") {
    return { days: amount * 5 };
  }

  if (unit === "weekend") {
    return { days: amount * 2 };
  }

  if (unit === "week") {
    return { weeks: amount };
  }

  if (unit === "year") {
    return { years: amount };
  }

  if (unit === "quarter") {
    return { months: amount * 3 };
  }

  return { months: amount };
}
