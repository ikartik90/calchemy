import { expandTwoDigitYear } from "./date-math";
import { createCandidate } from "./shared";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { Candidate, DateOrder, ResolvedParseDateContext } from "../../types";

// Builds candidate interpretations for separated numeric dates.
export function parseNumericCandidates(
  input: string,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
  source: Candidate["source"],
): Candidate[] {
  if (!isNumericDate(input)) {
    return [];
  }

  return context.dateOrderPreference
    .map((order, index) => {
      const date = parseNumericDate(input, order, context.anchor.year, Temporal);
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

// Parses a separated numeric date using one date-order interpretation.
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

function isNumericDate(input: string): boolean {
  return /^\d{1,4}([./-])\d{1,2}\1\d{2,4}$/.test(input);
}

// Formats a date-order interpretation for candidate explanations.
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
