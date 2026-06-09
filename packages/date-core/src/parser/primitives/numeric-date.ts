import { expandTwoDigitYear } from "./date-math";
import { createCandidate } from "./shared";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { Candidate, DateOrder, ResolvedParseDateContext } from "../../types";

// Example: `parseNumericCandidates("03/04/25", context, Temporal, source)` returns date-order candidates.
export function parseNumericCandidates(
  input: string,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  source: Candidate["source"],
): Candidate[] {
  if (!isNumericDate(input)) {
    return [];
  }

  return dateOrderCandidates(input, context.dateOrderPreference)
    .map((order, index) => {
      const date = parseNumericDate(input, order, context.referenceDate.year, Temporal);
      if (!date) {
        return null;
      }

      return createCandidate(
        order.toLowerCase(),
        { kind: "single", date },
        Math.max(0.5, 0.9 - index * 0.08),
        date.toLocaleString(context.locale, { dateStyle: "long" }),
        source,
        `Interpreted as ${formatDateOrder(order)}.`,
      );
    })
    .filter((candidate): candidate is Candidate => candidate !== null);
}

// Example: `dateOrderCandidates("2026-11-10", ["MDY", "DMY"])` includes ISO-style `YMD`.
function dateOrderCandidates(input: string, preference: readonly DateOrder[]): DateOrder[] {
  return hasLeadingFourDigitYear(input) ? Array.from(new Set([...preference, "YMD" as const])) : [...preference];
}

// Example: `parseNumericDate("03/04/25", "DMY", 2026, Temporal)` returns 2025-04-03.
function parseNumericDate(
  input: string,
  dateOrder: DateOrder,
  anchorYear: number,
  Temporal: TemporalApi,
): PlainDate | null {
  const match = /^(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})$/.exec(input);

  if (!match) {
    return null;
  }

  const [, first, , second, third] = match;
  if (!first || !second || !third) {
    return null;
  }

  const a = Number(first);
  const b = Number(second);
  const c = expandTwoDigitYear(Number(third), anchorYear);

  const parts =
    dateOrder === "DMY"
      ? { year: c, month: b, day: a }
      : dateOrder === "YMD"
        ? { year: expandTwoDigitYear(a, anchorYear), month: b, day: Number(third) }
        : { year: c, month: a, day: b };

  try {
    return Temporal.PlainDate.from(parts, { overflow: "reject" });
  } catch {
    return null;
  }
}

// Example: `isNumericDate("2026-11-10")` returns true.
function isNumericDate(input: string): boolean {
  return /^\d{1,4}([./-])\d{1,2}\1\d{2,4}$/.test(input);
}

// Example: `hasLeadingFourDigitYear("2026-11-10")` returns true.
function hasLeadingFourDigitYear(input: string): boolean {
  return /^\d{4}([./-])\d{1,2}\1\d{2,4}$/.test(input);
}

// Example: `formatDateOrder("MDY")` returns `MM/DD/YY`.
function formatDateOrder(order: DateOrder): string {
  switch (order) {
    case "DMY":
      return "DD/MM/YY";
    case "MDY":
      return "MM/DD/YY";
    case "YMD":
      return "YY/MM/DD";
  }
}
