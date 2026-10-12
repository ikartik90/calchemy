import { DayGroupPeriodSet, PeriodAliasMap, type DayGroupPeriod, type Period } from "../types";

// Example: `parsePeriod("weekends")` returns `weekend`.
export function parsePeriod(input: string): Period | null {
  return PeriodAliasMap.get(input as never) ?? null;
}

// Example: `parseDayGroup("weekdays")` returns `weekdays`.
export function parseDayGroup(input: string): DayGroupPeriod | null {
  const period = parsePeriod(input);
  return period && DayGroupPeriodSet.has(period) ? (period as DayGroupPeriod) : null;
}
