import type { TemporalApi } from "./core/temporal/types";
import type { DateOrder, ParseDateContext, ResolvedParseDateContext } from "./core/types";

const DefaultDateOrderPreference: DateOrder[] = ["DMY", "MDY", "YMD"];

// Example: `resolveContext({}, Temporal)` fills parser defaults around the current reference date.
export function resolveContext(context: ParseDateContext, Temporal: TemporalApi): ResolvedParseDateContext {
  return {
    referenceDate: context.referenceDate ?? Temporal.Now.plainDateISO(context.timeZone),
    locale: context.locale ?? "en-US",
    weekStartsOn: context.weekStartsOn ?? 0,
    dateOrderPreference:
      context.dateOrderPreference && context.dateOrderPreference.length > 0
        ? Array.from(new Set(context.dateOrderPreference))
        : DefaultDateOrderPreference,
    lastNDaysIncludesToday: context.lastNDaysIncludesToday ?? true,
  };
}
