import { useMemo, useState } from "react";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import type { PlainDate } from "@calchemy/date-core";
import { CalendarContext, useCalchemyCalendar, useCalchemyContext } from "./context";
import { CalendarGrid, CalendarWeekdays } from "./CalendarGrid";
import {
  addCalendarPeriod,
  buildCalendarPeriods,
  clampDateToBounds,
  formatCalendarWindowLabel,
  getCalendarPeriodAtOffset,
  getDateValueAnchor,
  getInitialPeriodExtensions,
  getSelectedValue,
  getToday,
  parseCalendarDuration,
  parseCalendarPageSize,
  periodIntersectsBounds,
  validateCalendarBounds,
} from "./date-model";
import type { CalendarBounds, CalendarDuration, CalendarNamedDates, CalendarState } from "./types";

const defaultCalendarPeriod = { months: 1 } satisfies CalendarDuration;
const defaultCalendarPageSize = { months: 1 } satisfies CalendarDuration;

export type CalchemyCalendarProps = Omit<ComponentPropsWithoutRef<"div">, "onSelect"> & {
  period?: CalendarDuration;
  bounds?: CalendarBounds;
  isDateDisabled?: CalendarState["isDateDisabled"];
  namedDates?: CalendarNamedDates;
};

export function Calendar({
  period = defaultCalendarPeriod,
  bounds,
  isDateDisabled,
  namedDates,
  children,
  ...divProps
}: CalchemyCalendarProps) {
  const state = useCalchemyContext();
  validateCalendarBounds(bounds);
  const parsedPeriod = useMemo(() => parseCalendarDuration(period, "period"), [period]);
  const selected = getSelectedValue(state);
  const today = getToday(state);
  const derivedAnchor = getDateValueAnchor(selected) ?? today;
  const [navigationAnchor, setNavigationAnchor] = useState<{ date: PlainDate; inputValue: string } | null>(null);
  const [periodExtensions, setPeriodExtensions] = useState(() => getInitialPeriodExtensions(parsedPeriod));
  const [visiblePeriodIndex, setScrolledVisiblePeriodIndex] = useState<{
    anchor: string;
    inputValue: string;
    index: number;
  } | null>(null);
  const periodAnchor = clampDateToBounds(
    navigationAnchor?.inputValue === state.inputValue ? navigationAnchor.date : derivedAnchor,
    bounds,
  );
  const periodAnchorKey = periodAnchor.toString();
  const activeVisiblePeriodIndex =
    visiblePeriodIndex?.anchor === periodAnchorKey && visiblePeriodIndex.inputValue === state.inputValue
      ? visiblePeriodIndex.index
      : 0;
  const weekStartsOn = state.parseContext?.weekStartsOn ?? 0;
  const locale = state.parseContext?.locale ?? "en-US";
  const periods = useMemo(
    () => buildCalendarPeriods(periodAnchor, parsedPeriod, weekStartsOn, locale, periodExtensions, bounds),
    [periodAnchor, parsedPeriod.count, parsedPeriod.unit, weekStartsOn, locale, periodExtensions, bounds],
  );
  const visiblePeriods = useMemo(
    () => {
      const visible = periods.filter(
        (item) =>
          item.index >= activeVisiblePeriodIndex && item.index < activeVisiblePeriodIndex + parsedPeriod.count,
      );

      return visible.length > 0 ? visible : periods.slice(0, parsedPeriod.count);
    },
    [periods, activeVisiblePeriodIndex, parsedPeriod.count],
  );
  const visiblePeriodAnchor = visiblePeriods[0]?.start ?? periodAnchor;

  function setCalendarPeriodAnchor(date: PlainDate) {
    setNavigationAnchor({ date: clampDateToBounds(date, bounds), inputValue: state.inputValue });
    setPeriodExtensions(getInitialPeriodExtensions(parsedPeriod));
    setScrolledVisiblePeriodIndex(null);
  }

  function canMoveCalendar(unit: "month" | "week", count: number) {
    const target = addCalendarPeriod(visiblePeriodAnchor, unit, count);
    return target.equals(clampDateToBounds(target, bounds));
  }

  function canExtendCalendarPeriods(direction: "before" | "after", windows = 1) {
    if (!bounds) {
      return true;
    }

    const extendCount = parsedPeriod.count * windows;
    const firstIndex = periods[0]?.index ?? 0;
    const lastIndex = periods.at(-1)?.index ?? parsedPeriod.count - 1;
    const targetIndex = direction === "before" ? firstIndex - extendCount : lastIndex + 1;
    const targetPeriod = getCalendarPeriodAtOffset(periodAnchor, parsedPeriod, weekStartsOn, locale, targetIndex);

    return periodIntersectsBounds(targetPeriod, bounds);
  }

  const calendarState = useMemo(
    () =>
      ({
        calchemy: state,
        period: parsedPeriod,
        periodAnchor,
        visiblePeriodAnchor,
        today,
        selected,
        periods,
        visiblePeriods,
        weekStartsOn,
        locale,
        bounds,
        namedDates,
        isDateDisabled,
        setPeriodAnchor: setCalendarPeriodAnchor,
        setVisiblePeriodIndex(index) {
          setScrolledVisiblePeriodIndex((current) => {
            if (
              current?.anchor === periodAnchorKey &&
              current.inputValue === state.inputValue &&
              current.index === index
            ) {
              return current;
            }

            return { anchor: periodAnchorKey, inputValue: state.inputValue, index };
          });
        },
        canMove: canMoveCalendar,
        move(unit, count) {
          if (!canMoveCalendar(unit, count)) {
            return;
          }

          setNavigationAnchor({
            date: clampDateToBounds(addCalendarPeriod(visiblePeriodAnchor, unit, count), bounds),
            inputValue: state.inputValue,
          });
          setPeriodExtensions(getInitialPeriodExtensions(parsedPeriod));
          setScrolledVisiblePeriodIndex(null);
        },
        canExtendPeriods: canExtendCalendarPeriods,
        extendPeriods(direction, windows = 1) {
          if (!canExtendCalendarPeriods(direction, windows)) {
            return;
          }

          setPeriodExtensions((current) => ({
            ...current,
            [direction]: current[direction] + parsedPeriod.count * windows,
          }));
        },
        selectDate(date) {
          state.selectDate({ kind: "single", date });
        },
      }) satisfies CalendarState,
    [
      state,
      parsedPeriod,
      periodAnchor,
      periodAnchorKey,
      visiblePeriodAnchor,
      today,
      selected,
      periods,
      visiblePeriods,
      weekStartsOn,
      locale,
      bounds,
      namedDates,
      isDateDisabled,
    ],
  );

  const content = children ?? (
    <>
      <CalendarHeader>
        <CalendarPrevious pageSize={defaultCalendarPageSize} />
        <CalendarHeading />
        <CalendarNext pageSize={defaultCalendarPageSize} />
      </CalendarHeader>
      <CalendarWeekdays />
      <CalendarGrid />
    </>
  );

  return (
    <CalendarContext.Provider value={calendarState}>
      <div {...divProps} data-calchemy-calendar="">
        {content}
      </div>
    </CalendarContext.Provider>
  );
}

export type CalchemyCalendarHeaderProps = ComponentPropsWithoutRef<"div">;

export function CalendarHeader(props: CalchemyCalendarHeaderProps) {
  return <div {...props} data-calchemy-header="" />;
}

export type CalchemyCalendarHeadingProps = ComponentPropsWithoutRef<"h2">;

export function CalendarHeading(props: CalchemyCalendarHeadingProps) {
  const calendar = useCalchemyCalendar();

  return (
    <h2 {...props} data-calchemy-heading="">
      {props.children ?? formatCalendarWindowLabel(calendar.visiblePeriods, calendar.locale)}
    </h2>
  );
}

export type CalchemyCalendarNavigationProps = Omit<ComponentPropsWithoutRef<"button">, "onClick"> & {
  pageSize?: CalendarDuration;
  onClick?: ComponentPropsWithoutRef<"button">["onClick"];
};

export function CalendarPrevious({
  pageSize = defaultCalendarPageSize,
  onClick,
  children,
  ...props
}: CalchemyCalendarNavigationProps) {
  return (
    <CalendarNavigationButton
      {...props}
      pageSize={pageSize}
      direction={-1}
      data-calchemy-previous=""
      onClick={onClick}
    >
      {children ?? "Previous"}
    </CalendarNavigationButton>
  );
}

export function CalendarNext({
  pageSize = defaultCalendarPageSize,
  onClick,
  children,
  ...props
}: CalchemyCalendarNavigationProps) {
  return (
    <CalendarNavigationButton
      {...props}
      pageSize={pageSize}
      direction={1}
      data-calchemy-next=""
      onClick={onClick}
    >
      {children ?? "Next"}
    </CalendarNavigationButton>
  );
}

type CalendarNavigationButtonProps = CalchemyCalendarNavigationProps & {
  direction: -1 | 1;
};

function CalendarNavigationButton({
  pageSize,
  direction,
  onClick,
  type = "button",
  ...props
}: CalendarNavigationButtonProps) {
  const calendar = useCalchemyCalendar();
  const increment = parseCalendarPageSize(pageSize ?? defaultCalendarPageSize);
  const disabled = props.disabled ?? !calendar.canMove(increment.unit, increment.count * direction);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled) {
      return;
    }

    calendar.move(increment.unit, increment.count * direction);
  }

  return <button {...props} type={type} disabled={disabled} onClick={handleClick} />;
}
