import { endOfMonth } from "./date-math";
import { parseOrdinal } from "./ordinal";
import { parseAmount } from "./shared";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue } from "../../types";

// Parses calendar quarter ranges such as "Q1", "Q3 2027", or "Q4 next year".
export function parseQuarterRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const relativeQuarter = parseRelativeQuarterRange(input, anchorDate, Temporal);
  if (relativeQuarter) {
    return relativeQuarter;
  }

  const ordinalQuarter = parseOrdinalQuarterRange(input, anchorDate, Temporal);
  if (ordinalQuarter) {
    return ordinalQuarter;
  }

  const match = /^q\s*([1-4])(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const quarter = parseAmount(match[1]);
  if (!quarter || quarter < 1 || quarter > 4) {
    return null;
  }

  const year = resolveQuarterYear(match[2], match[3], anchorDate.year);
  return createQuarterRange(quarter, year, Temporal);
}

function parseOrdinalQuarterRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const match = /^(.+) quarter(?: of)? (?:(this|next|last|previous) year|(\d{2,4}))$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const quarter = parseOrdinal(match[1]);
  if (!quarter || quarter < 1 || quarter > 4) {
    return null;
  }

  const year = resolveQuarterYear(match[2], match[3], anchorDate.year);
  return createQuarterRange(quarter, year, Temporal);
}

function parseRelativeQuarterRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const match = /^(this|next|last|previous) quarter$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const currentQuarter = Math.floor((anchorDate.month - 1) / 3) + 1;
  const quarterOffset = match[1] === "this" ? 0 : match[1] === "next" ? 1 : -1;
  const quarterIndex = currentQuarter - 1 + quarterOffset;
  const year = anchorDate.year + Math.floor(quarterIndex / 4);
  const zeroBasedQuarter = ((quarterIndex % 4) + 4) % 4;
  const start = Temporal.PlainDate.from({ year, month: zeroBasedQuarter * 3 + 1, day: 1 });
  const end = endOfMonth(start.add({ months: 2 }));

  return { kind: "range", start, end };
}

function resolveQuarterYear(relativeYear: string | undefined, explicitYear: string | undefined, anchorYear: number): number {
  if (relativeYear === "next") {
    return anchorYear + 1;
  }

  if (relativeYear === "last" || relativeYear === "previous") {
    return anchorYear - 1;
  }

  if (explicitYear) {
    return Number(explicitYear);
  }

  return anchorYear;
}

function createQuarterRange(quarter: number, year: number, Temporal: TemporalApi): DateValue {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = Temporal.PlainDate.from({ year, month: startMonth, day: 1 });
  const end = endOfMonth(start.add({ months: 2 }));

  return { kind: "range", start, end };
}
