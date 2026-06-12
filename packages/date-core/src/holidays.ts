import type { PlainDate } from "./temporal/types";
import type { HolidayProvider, NamedDatesVocabularyEntry, ResolvedParseDateContext } from "./types";

// Example: `resolveHolidayProvider(namedDates, resolvedContext)` builds a holiday checker from `isHoliday` named dates.
export function resolveHolidayProvider(
  namedDates: readonly NamedDatesVocabularyEntry[],
  resolvedContext: Omit<ResolvedParseDateContext, "holidays">,
): HolidayProvider | undefined {
  const holidayEntries = namedDates.filter((entry) => entry.isHoliday);
  return holidayEntries.length > 0
    ? createNamedDatesHolidayProvider(holidayEntries, resolvedContext)
    : undefined;
}

// Example: `createNamedDatesHolidayProvider([christmasEntry], context)` checks configured holiday named dates.
function createNamedDatesHolidayProvider(
  entries: readonly NamedDatesVocabularyEntry[],
  context: Omit<ResolvedParseDateContext, "holidays">,
): HolidayProvider {
  return {
    id: "named-dates-holidays",
    label: "Configured holidays",
    includes(date: PlainDate) {
      return entries.some(
        (entry) =>
          entry.resolveDate({
            year: date.year,
            context: { ...context, referenceDate: date },
          })?.equals(date) ?? false,
      );
    },
  };
}
