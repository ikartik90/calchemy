import { endOfMonth } from "../primitives/date-math";
import { expandTwoDigitYear } from "../primitives/date-math";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue } from "../../types";

// Parses calendar month ranges such as "M3", "M3 22", or "M12 next year".
export function parseMonthRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const match = /^m\s*(1[0-2]|[1-9])(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const month = Number(match[1]);
  const year = resolveMonthYear(match[2], match[3], anchorDate.year);
  const start = Temporal.PlainDate.from({ year, month, day: 1 });

  return { kind: "range", start, end: endOfMonth(start) };
}

// Resolves relative and explicit years for shorthand month ranges.
function resolveMonthYear(relativeYear: string | undefined, explicitYear: string | undefined, anchorYear: number): number {
  if (relativeYear === "next") {
    return anchorYear + 1;
  }

  if (relativeYear === "last" || relativeYear === "previous") {
    return anchorYear - 1;
  }

  if (explicitYear) {
    return expandTwoDigitYear(Number(explicitYear), anchorYear);
  }

  return anchorYear;
}
