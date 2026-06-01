import { expandTwoDigitYear, startOfWeek } from "./date-math";
import { parseOrdinal } from "./ordinal";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue } from "../../types";

// Parses ordinal week ranges such as "week 52" or "the fifty-second week".
export function parseWeekRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const shorthand = parseWeekShorthandRange(input, anchorDate, Temporal);
  if (shorthand) {
    return shorthand;
  }

  const match = /^(?:week (.+?)|(?:the )?(.+?) week)(?: (?:of )?(?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    if (!match?.[2]) {
      return null;
    }
  }

  const weekInput = match[1] ?? match[2];
  if (!weekInput) {
    return null;
  }

  const week = parseOrdinal(weekInput);
  if (!week || week < 1) {
    return null;
  }

  const year = resolveWeekYear(match[3], match[4], anchorDate.year);
  const weekOneStart = startOfWeek(Temporal.PlainDate.from({ year, month: 1, day: 4 }), 1);
  const start = weekOneStart.add({ weeks: week - 1 });

  return { kind: "range", start, end: start.add({ days: 6 }) };
}

// Parses shorthand week ranges such as "W3", "W3 22", or "W52 next year".
function parseWeekShorthandRange(input: string, anchorDate: PlainDate, Temporal: TemporalApi): DateValue | null {
  const match = /^w\s*(.+?)(?: (?:(this|next|last|previous) year|(\d{2,4})))?$/.exec(input);
  if (!match?.[1]) {
    return null;
  }

  const week = parseOrdinal(match[1]);
  if (!week || week < 1) {
    return null;
  }

  const year = resolveWeekYear(match[2], match[3], anchorDate.year);
  const weekOneStart = startOfWeek(Temporal.PlainDate.from({ year, month: 1, day: 4 }), 1);
  const start = weekOneStart.add({ weeks: week - 1 });

  return { kind: "range", start, end: start.add({ days: 6 }) };
}

function resolveWeekYear(relativeYear: string | undefined, explicitYear: string | undefined, anchorYear: number): number {
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
