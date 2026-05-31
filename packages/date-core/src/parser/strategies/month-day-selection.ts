import { endOfMonth, startOfMonth } from "./date-math";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Parses month day-number selections like "all odd numbered dates in december".
export function parseMonthDayNumberSelection(
  input: string,
  anchorDate: PlainDate,
  Temporal: TemporalApi,
  lookups: DateVocabularyLookups,
  context: ResolvedParseDateContext,
): DateValue | null {
  const match = /^all (odd|even) numbered dates? in ([a-z]+)(?:\.?\s*(?:skip|excluding) holidays)?$/.exec(input);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const month = lookups.months.get(match[2]);
  if (!month) {
    return null;
  }

  const skipHolidays = input.includes("skip holidays") || input.includes("excluding holidays");
  const parity = match[1];
  const monthStart = startOfMonth(Temporal.PlainDate.from({ year: anchorDate.year, month, day: 1 }));
  const monthEnd = endOfMonth(monthStart);
  const dates: PlainDate[] = [];
  let cursor = monthStart;

  while (cursor.toString().localeCompare(monthEnd.toString()) <= 0) {
    const isMatchingParity = parity === "odd" ? cursor.day % 2 === 1 : cursor.day % 2 === 0;
    if (isMatchingParity && !(skipHolidays && context.holidays?.includes(cursor))) {
      dates.push(cursor);
    }

    cursor = cursor.add({ days: 1 });
  }

  return { kind: "multiple", dates };
}
