import { endOfNextMonth, firstWeekdayAfter, startOfNextWeek } from "./date-math";
import { comparePlainDate } from "./shared";
import type { PlainDate } from "../../temporal/types";
import type { DateValue, ResolvedParseDateContext } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

// Parses recurring weekday phrases ending around the next month boundary.
export function parseRecurring(
  input: string,
  anchorDate: PlainDate,
  context: ResolvedParseDateContext,
  lookups: DateVocabularyLookups,
): DateValue | null {
  if (!input.startsWith("all ")) {
    return null;
  }

  const untilFirstMondayAfterNextMonth = input.includes("until the first monday after the end of next month");
  const untilEndOfNextMonth = input.includes("until end of next month") || input.includes("until the end of next month");

  if (!untilFirstMondayAfterNextMonth && !untilEndOfNextMonth) {
    return null;
  }

  const weekdays = Array.from(lookups.weekdays.entries())
    .filter(([name]) => input.includes(name))
    .map(([, weekday]) => weekday);

  if (weekdays.length === 0) {
    return null;
  }

  const monthEnd = endOfNextMonth(anchorDate);
  const until = untilFirstMondayAfterNextMonth ? firstWeekdayAfter(monthEnd, 1) : monthEnd;
  const skipHoliday = input.includes("excluding holidays");
  const skipTomorrow = input.includes("except tomorrow");
  const skipNextWeek = input.includes("skip next week");
  const nextWeekStart = startOfNextWeek(anchorDate, context.weekStartsOn);
  const nextWeekEnd = nextWeekStart.add({ days: 6 });
  const tomorrow = anchorDate.add({ days: 1 });
  const dates: PlainDate[] = [];
  let cursor = anchorDate;

  while (comparePlainDate(cursor, until) <= 0) {
    const shouldInclude =
      weekdays.includes(cursor.dayOfWeek) &&
      !(skipHoliday && context.holidays?.includes(cursor)) &&
      !(skipTomorrow && cursor.equals(tomorrow)) &&
      !(skipNextWeek && comparePlainDate(cursor, nextWeekStart) >= 0 && comparePlainDate(cursor, nextWeekEnd) <= 0);

    if (shouldInclude) {
      dates.push(cursor);
    }

    cursor = cursor.add({ days: 1 });
  }

  return { kind: "multiple", dates };
}
