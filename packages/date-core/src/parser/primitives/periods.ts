export type { CalendarRangePeriod, DayGroupPeriod, Period } from "../types";
import { PeriodAliasMap, type Period } from "../types";

// Example: `parsePeriod("weekends")` returns `weekend`.
export function parsePeriod(input: string): Period | null {
  return PeriodAliasMap.get(input as never) ?? null;
}
