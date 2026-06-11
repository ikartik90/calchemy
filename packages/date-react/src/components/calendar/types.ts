import type {
  DateValue,
  NamedDatesVocabularyEntry,
  PlainDate,
  WeekdayIndex,
} from "@calchemy/date-core";
import type { CalchemyState } from "../../hooks/useCalchemy";

export type CalendarPeriodUnit = "month" | "week";
export type CalendarScrollDirection = "horizontal" | "vertical";
export type CalendarDuration = { months: number } | { weeks: number };
export type CalendarWeekdayFormat = "long" | "short" | "narrow";
export type CalendarBounds = {
  start?: PlainDate;
  end?: PlainDate;
};
export type CalendarNamedDates = "all" | "holidays";

export type ParsedCalendarPeriod = {
  unit: CalendarPeriodUnit;
  count: number;
};

export type CalendarPeriodModel = {
  id: string;
  unit: CalendarPeriodUnit;
  index: number;
  start: PlainDate;
  end: PlainDate;
  label: string;
};

export type CalendarState = {
  calchemy: CalchemyState;
  period: ParsedCalendarPeriod;
  periodAnchor: PlainDate;
  visiblePeriodAnchor: PlainDate;
  today: PlainDate;
  selected: DateValue | null;
  periods: CalendarPeriodModel[];
  visiblePeriods: CalendarPeriodModel[];
  weekStartsOn: WeekdayIndex;
  locale: string;
  bounds: CalendarBounds | undefined;
  namedDates: CalendarNamedDates | undefined;
  editable: boolean;
  isDateDisabled: ((date: PlainDate, calendar: CalendarState) => boolean) | undefined;
  setPeriodAnchor(date: PlainDate): void;
  setVisiblePeriodIndex(index: number): void;
  canMove(unit: CalendarPeriodUnit, count: number): boolean;
  move(unit: CalendarPeriodUnit, count: number): void;
  canExtendPeriods(direction: "before" | "after", windows?: number): boolean;
  extendPeriods(direction: "before" | "after", windows?: number): void;
  selectDate(date: PlainDate): void;
  selectValue(value: DateValue): void;
};

export type CalendarScrollContextValue = {
  direction: CalendarScrollDirection;
  leadingSpacerPeriodCount: number;
  leadingSpacerPixelSize: number;
};

export type CalendarDayState = {
  outside: boolean;
  selected: boolean;
  today: boolean;
  weekend: boolean;
  firstOfPeriod: boolean;
  lastOfPeriod: boolean;
  bounded: boolean;
  disabled: boolean;
  namedDates: readonly NamedDatesVocabularyEntry[];
};
