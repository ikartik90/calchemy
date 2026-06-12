import type {
  DateOrder,
  DateValue,
  NamedDatesVocabularyEntry,
  PlainDate,
  WeekdayIndex,
} from "@calchemy/date-core";
import type { CalchemyState } from "../../hooks/useCalchemy";
import type {
  CalendarBounds,
  CalendarDayState,
  CalendarDuration,
  CalendarPeriodModel,
  CalendarPeriodUnit,
  CalendarState,
  CalendarWeekdayFormat,
  ParsedCalendarPeriod,
} from "./types";

const defaultDateOrderPreference: DateOrder[] = ["DMY", "MDY", "YMD"];
type NamedDateResolveContext = Parameters<NamedDatesVocabularyEntry["resolveDate"]>[0]["context"];

export function getFirstVisibleCalendarPeriod(calendar: CalendarState): CalendarPeriodModel {
  const period = calendar.visiblePeriods[0];
  if (!period) {
    throw new Error("Calchemy.Calendar requires at least one visible generated period.");
  }

  return period;
}

export function getCalendarDayState(
  calendar: CalendarState,
  period: CalendarPeriodModel,
  date: PlainDate,
): CalendarDayState {
  const bounded = isDateWithinBounds(date, calendar.bounds);
  const namedDates = getNamedDatesForDate(calendar, date);
  const disabled =
    !bounded || (calendar.isDateDisabled?.(date, calendar) ?? false);

  return {
    outside: isBefore(date, period.start) || isAfter(date, period.end),
    selected: isSelectedDate(calendar.selected, date),
    today: calendar.today.equals(date),
    weekend: isWeekend(date),
    firstOfPeriod: date.equals(period.start),
    lastOfPeriod: date.equals(period.end),
    bounded,
    disabled,
    namedDates,
  };
}

export function parseCalendarDuration(value: CalendarDuration, propName: string): ParsedCalendarPeriod {
  const hasMonths = "months" in value;
  const hasWeeks = "weeks" in value;
  if (hasMonths === hasWeeks) {
    throw new Error(`Calchemy.Calendar ${propName} must include exactly one of months or weeks.`);
  }

  const count = hasMonths ? value.months : value.weeks;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Calchemy.Calendar ${propName} must be a positive integer duration.`);
  }

  return {
    unit: hasMonths ? "month" : "week",
    count,
  };
}

export function validateCalendarBounds(bounds: CalendarBounds | undefined): void {
  if (bounds?.start && bounds.end && isAfter(bounds.start, bounds.end)) {
    throw new Error("Calchemy.Calendar bounds.start must be on or before bounds.end.");
  }
}

export function clampDateToBounds(date: PlainDate, bounds: CalendarBounds | undefined): PlainDate {
  if (bounds?.start && isBefore(date, bounds.start)) {
    return bounds.start;
  }
  if (bounds?.end && isAfter(date, bounds.end)) {
    return bounds.end;
  }

  return date;
}

function isDateWithinBounds(date: PlainDate, bounds: CalendarBounds | undefined): boolean {
  return (!bounds?.start || !isBefore(date, bounds.start)) && (!bounds?.end || !isAfter(date, bounds.end));
}

export function periodIntersectsBounds(period: CalendarPeriodModel, bounds: CalendarBounds | undefined): boolean {
  return (!bounds?.start || !isBefore(period.end, bounds.start)) && (!bounds?.end || !isAfter(period.start, bounds.end));
}

export function getCalendarPeriodAtOffset(
  anchor: PlainDate,
  period: ParsedCalendarPeriod,
  weekStartsOn: WeekdayIndex,
  locale: string,
  offset: number,
): CalendarPeriodModel {
  const firstStart = period.unit === "month" ? startOfMonth(anchor) : startOfWeek(anchor, weekStartsOn);
  const start = addCalendarPeriod(firstStart, period.unit, offset);
  const end = period.unit === "month" ? endOfMonth(start) : start.add({ days: 6 });

  return {
    id: `${period.unit}-${start.toString()}`,
    unit: period.unit,
    index: offset,
    start,
    end,
    label: formatPeriodLabel(start, end, period.unit, locale),
  };
}

export function getInitialPeriodExtensions(period: ParsedCalendarPeriod): { before: number; after: number } {
  return {
    before: period.count * 6,
    after: period.count * 3,
  };
}

export function getSelectedValue(state: CalchemyState): DateValue | null {
  const resultValue = getResultValue(state);
  return state.value ?? resultValue;
}

export function getDateValueAnchor(value: DateValue | null): PlainDate | null {
  if (!value) {
    return null;
  }

  switch (value.kind) {
    case "single":
      return value.date;
    case "range":
      return value.start;
    case "multiple":
      return value.dates[0] ?? null;
  }
}

export function getDateValueKey(value: DateValue | null): string {
  if (!value) {
    return "";
  }

  switch (value.kind) {
    case "single":
      return `single:${value.date.toString()}`;
    case "range":
      return `range:${value.start.toString()}:${value.end.toString()}`;
    case "multiple":
      return `multiple:${value.dates.map((date) => date.toString()).join(",")}`;
  }
}

export function isDateInCalendarViewport(
  date: PlainDate,
  periods: readonly CalendarPeriodModel[],
  visiblePeriodIndex: number,
  windowCount: number,
): boolean {
  return periods
    .filter(
      (period) =>
        period.index >= visiblePeriodIndex && period.index < visiblePeriodIndex + windowCount,
    )
    .some((period) => !isBefore(date, period.start) && !isAfter(date, period.end));
}

function getResultValue(state: CalchemyState): DateValue | null {
  return state.result.status === "valid" ? state.result.value : null;
}

export function getToday(state: CalchemyState): PlainDate {
  if (state.parseContext?.referenceDate) {
    return state.parseContext.referenceDate;
  }

  const todayResult = state.calchemy.parseDate("today", state.parseContext);
  if (todayResult.status === "valid" && todayResult.value.kind === "single") {
    return todayResult.value.date;
  }

  return state.calchemy.Temporal.Now.plainDateISO(state.parseContext?.timeZone);
}

export function buildCalendarPeriods(
  anchor: PlainDate,
  period: ParsedCalendarPeriod,
  weekStartsOn: WeekdayIndex,
  locale: string,
  extensions: { before: number; after: number },
  bounds?: CalendarBounds,
): CalendarPeriodModel[] {
  const total = extensions.before + period.count + extensions.after;

  return Array.from({ length: total }, (_, index) => {
    const offset = index - extensions.before;
    return getCalendarPeriodAtOffset(anchor, period, weekStartsOn, locale, offset);
  }).filter((item) => periodIntersectsBounds(item, bounds));
}

export function buildCalendarWeeks(period: CalendarPeriodModel, weekStartsOn: WeekdayIndex): PlainDate[][] {
  const start = startOfWeek(period.start, weekStartsOn);
  const end = endOfWeek(period.end, weekStartsOn);
  const weeks: PlainDate[][] = [];
  let cursor = start;

  while (!isAfter(cursor, end)) {
    const week = Array.from({ length: 7 }, (_, index) => cursor.add({ days: index }));
    weeks.push(week);
    cursor = cursor.add({ days: 7 });
  }

  return weeks;
}

export function buildWeekdays(
  calendar: CalendarState,
  weekdayFormat: CalendarWeekdayFormat = "short",
): Array<{ index: number; label: string; weekend: boolean }> {
  const sunday = startOfWeek(calendar.today, 0);
  const first = startOfWeek(calendar.today, calendar.weekStartsOn);

  return Array.from({ length: 7 }, (_, index) => {
    const date = first.add({ days: index });
    const weekdayIndex = sunday.until(date).days % 7;
    return {
      index: weekdayIndex,
      label: date.toLocaleString(calendar.locale, { weekday: weekdayFormat }),
      weekend: isWeekend(date),
    };
  });
}

export function addCalendarPeriod(date: PlainDate, unit: CalendarPeriodUnit, count: number): PlainDate {
  return unit === "month" ? date.add({ months: count }) : date.add({ weeks: count });
}

export function formatCalendarWindowLabel(periods: CalendarPeriodModel[], locale: string): string {
  const first = periods[0];
  const last = periods.at(-1);
  if (!first || !last) {
    return "";
  }
  if (first.start.equals(last.start) && first.end.equals(last.end)) {
    return first.label;
  }

  return `${formatDateLabel(first.start, locale)} - ${formatDateLabel(last.end, locale)}`;
}

export function formatMonthLabel(date: PlainDate, locale: string): string {
  return date.toLocaleString(locale, { month: "long" });
}

function startOfMonth(date: PlainDate): PlainDate {
  return date.with({ day: 1 });
}

function endOfMonth(date: PlainDate): PlainDate {
  return startOfMonth(date).add({ months: 1 }).subtract({ days: 1 });
}

function startOfWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  const temporalWeekday = weekStartsOn === 0 ? 7 : weekStartsOn;
  let cursor = date;

  while (cursor.dayOfWeek !== temporalWeekday) {
    cursor = cursor.subtract({ days: 1 });
  }

  return cursor;
}

function endOfWeek(date: PlainDate, weekStartsOn: WeekdayIndex): PlainDate {
  return startOfWeek(date, weekStartsOn).add({ days: 6 });
}

export function isBefore(left: PlainDate, right: PlainDate): boolean {
  return left.toString() < right.toString();
}

export function isAfter(left: PlainDate, right: PlainDate): boolean {
  return left.toString() > right.toString();
}

function isSelectedDate(value: DateValue | null, date: PlainDate): boolean {
  if (!value) {
    return false;
  }

  switch (value.kind) {
    case "single":
      return value.date.equals(date);
    case "range":
      return !isBefore(date, value.start) && !isAfter(date, value.end);
    case "multiple":
      return value.dates.some((selectedDate) => selectedDate.equals(date));
  }
}

function isWeekend(date: PlainDate): boolean {
  return date.dayOfWeek === 6 || date.dayOfWeek === 7;
}

function getNamedDatesForDate(calendar: CalendarState, date: PlainDate) {
  if (!calendar.namedDates) {
    return [];
  }

  const context = getResolvedNamedDateContext(calendar);
  return calendar.calchemy.calchemy.namedDatesVocabulary.filter((entry) => {
    if (calendar.namedDates === "holidays" && !entry.isHoliday) {
      return false;
    }

    return entry.resolveDate({ year: date.year, context })?.equals(date) ?? false;
  });
}

function getResolvedNamedDateContext(calendar: CalendarState): NamedDateResolveContext {
  const context = calendar.calchemy.parseContext;

  return {
    referenceDate:
      context?.referenceDate ??
      calendar.calchemy.calchemy.Temporal.Now.plainDateISO(context?.timeZone),
    locale: context?.locale ?? "en-US",
    weekStartsOn: context?.weekStartsOn ?? 0,
    dateOrderPreference: normalizeDateOrderPreference(context?.dateOrderPreference),
    lastNDaysIncludesToday: context?.lastNDaysIncludesToday ?? true,
  };
}

function normalizeDateOrderPreference(value: DateOrder[] | undefined): DateOrder[] {
  if (!value || value.length === 0) {
    return defaultDateOrderPreference;
  }

  return Array.from(new Set(value));
}

function formatPeriodLabel(start: PlainDate, end: PlainDate, unit: CalendarPeriodUnit, locale: string): string {
  if (unit === "month") {
    return formatDateLabel(start, locale);
  }

  return `${start.toLocaleString(locale, { month: "short", day: "numeric" })} - ${end.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatDateLabel(date: PlainDate, locale: string): string {
  return date.toLocaleString(locale, { month: "long", year: "numeric" });
}
