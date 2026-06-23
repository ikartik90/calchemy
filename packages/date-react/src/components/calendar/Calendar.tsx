import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, MouseEvent } from "react";
import type { PlainDate } from "@calchemy/date-core";
import { CalendarContext, useCalchemyCalendar, useCalchemyContext } from "./context";
import { CalendarGrid, CalendarWeekdays } from "./CalendarGrid";
import { navigateCalendarWindow } from "./calendar-navigation";
import {
  addCalendarPeriod,
  buildCalendarPeriods,
  clampDateToBounds,
  formatCalendarWindowLabel,
  getCalendarPeriodAtOffset,
  getDateValueAnchor,
  getDateValueKey,
  getInitialPeriodExtensions,
  getSelectedValue,
  getToday,
  isBefore,
  isDateInCalendarViewport,
  parseCalendarDuration,
  periodIntersectsBounds,
  validateCalendarBounds,
} from "./date-model";
import type { CalendarBounds, CalendarDuration, CalendarNamedDates, CalendarState } from "./types";

const defaultCalendarPeriod = { months: 1 } satisfies CalendarDuration;

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
  const editable = state.inputMode === "calendar";
  validateCalendarBounds(bounds);
  const parsedPeriod = useMemo(() => parseCalendarDuration(period, "period"), [period]);
  const selected = getSelectedValue(state);
  const today = getToday(state);
  const [periodAnchor, setPeriodAnchor] = useState(() =>
    clampDateToBounds(getDateValueAnchor(selected) ?? today, bounds),
  );
  const [navigationAnchor, setNavigationAnchor] = useState<{ date: PlainDate; inputValue: string } | null>(null);
  const [periodExtensions, setPeriodExtensions] = useState(() => getInitialPeriodExtensions(parsedPeriod));
  const [visiblePeriodIndex, setScrolledVisiblePeriodIndex] = useState<{
    anchor: string;
    inputValue: string;
    index: number;
  } | null>(null);
  const prevInputValueRef = useRef(state.inputValue);
  const prevSelectedKeyRef = useRef(getDateValueKey(selected));
  const prevExpectedValueRef = useRef(state.expectedValue);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const periodIndexRef = useRef<number | null>(null);
  const animationCancelRef = useRef<(() => void) | null>(null);
  const navigationSyncRef = useRef({ suppressScrollSync: false });
  useEffect(() => {
    if (prevExpectedValueRef.current === state.expectedValue) {
      return;
    }

    prevExpectedValueRef.current = state.expectedValue;
    setScrolledVisiblePeriodIndex(null);
    setNavigationAnchor(null);
    setPeriodAnchor(clampDateToBounds(getDateValueAnchor(selected) ?? today, bounds));
    prevInputValueRef.current = state.inputValue;
    prevSelectedKeyRef.current = getDateValueKey(selected);
  }, [bounds, selected, state.expectedValue, state.inputValue, today]);
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

  useLayoutEffect(() => {
    periodIndexRef.current = visiblePeriods[0]?.index ?? null;
  }, [visiblePeriods]);

  useLayoutEffect(() => {
    const inputChanged = prevInputValueRef.current !== state.inputValue;
    prevInputValueRef.current = state.inputValue;

    const selectedKey = getDateValueKey(selected);
    const selectionChanged = prevSelectedKeyRef.current !== selectedKey;
    prevSelectedKeyRef.current = selectedKey;

    if (!inputChanged && !selectionChanged) {
      return;
    }

    if (selectionChanged && editable) {
      return;
    }

    const selectionAnchor = clampDateToBounds(getDateValueAnchor(selected) ?? today, bounds);
    const inputReflectsCalendarSelection = state.inputValue === selectionAnchor.toString();
    const shouldRevealSelection = inputChanged && !inputReflectsCalendarSelection;

    if (
      !shouldRevealSelection &&
      isDateInCalendarViewport(
        selectionAnchor,
        periods,
        activeVisiblePeriodIndex,
        parsedPeriod.count,
      )
    ) {
      return;
    }

    setPeriodAnchor((current) => (current.equals(selectionAnchor) ? current : selectionAnchor));
    setScrolledVisiblePeriodIndex(null);
  }, [
    activeVisiblePeriodIndex,
    bounds,
    editable,
    parsedPeriod.count,
    periods,
    selected,
    state.inputValue,
    today,
  ]);

  function setCalendarPeriodAnchor(date: PlainDate) {
    const clamped = clampDateToBounds(date, bounds);
    setPeriodAnchor(clamped);
    setNavigationAnchor({ date: clamped, inputValue: state.inputValue });
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

  function commitCalendarMove(unit: "month" | "week", count: number) {
    const clamped = clampDateToBounds(addCalendarPeriod(visiblePeriodAnchor, unit, count), bounds);
    setPeriodAnchor(clamped);
    setNavigationAnchor({
      date: clamped,
      inputValue: state.inputValue,
    });
    setPeriodExtensions(getInitialPeriodExtensions(parsedPeriod));
    setScrolledVisiblePeriodIndex(null);
  }

  const calendarStateRef = useRef<CalendarState | null>(null);
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
        editable,
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
        navigationRefs: {
          periodIndexRef,
          animationCancelRef,
          syncRef: navigationSyncRef,
        },
        canMove: canMoveCalendar,
        move(unit, count) {
          if (!canMoveCalendar(unit, count)) {
            return;
          }

          if (unit !== parsedPeriod.unit || Math.abs(count) !== parsedPeriod.count) {
            commitCalendarMove(unit, count);
            return;
          }

          const calendarElement = calendarRef.current;
          const currentState = calendarStateRef.current;
          if (!calendarElement || !currentState) {
            commitCalendarMove(unit, count);
            return;
          }

          navigateCalendarWindow(
            currentState,
            calendarElement,
            count > 0 ? 1 : -1,
            currentState.navigationRefs,
            () => commitCalendarMove(unit, count),
          );
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
          if (!editable) {
            return;
          }

          if (state.expectedValue === "range") {
            const current = selected;
            if (current?.kind === "range" && current.start.equals(current.end)) {
              const start = isBefore(current.start, date) ? current.start : date;
              const end = isBefore(current.start, date) ? date : current.start;
              state.selectDate({ kind: "range", start, end });
              return;
            }

            state.selectDate({ kind: "range", start: date, end: date });
            return;
          }

          state.selectDate({ kind: "single", date });
        },
        selectValue(value) {
          if (!editable) {
            return;
          }

          state.selectDate(value);
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
      editable,
      isDateDisabled,
    ],
  );
  calendarStateRef.current = calendarState;

  const content = children ?? (
    <>
      <CalendarHeader>
        <CalendarPrevious />
        <CalendarHeading />
        <CalendarNext />
      </CalendarHeader>
      <CalendarWeekdays />
      <CalendarGrid />
    </>
  );

  return (
    <CalendarContext.Provider value={calendarState}>
      <div
        {...divProps}
        ref={calendarRef}
        calchemy-calendar=""
        calchemy-editable={editable ? "" : undefined}
        style={
          {
            ...divProps.style,
            "--calchemy-calendar-period-count": parsedPeriod.count,
          } as CSSProperties
        }
      >
        {content}
      </div>
    </CalendarContext.Provider>
  );
}

export type CalchemyCalendarHeaderProps = ComponentPropsWithoutRef<"div">;

export function CalendarHeader(props: CalchemyCalendarHeaderProps) {
  return <div {...props} calchemy-header="" />;
}

export type CalchemyCalendarHeadingProps = ComponentPropsWithoutRef<"h2">;

export function CalendarHeading(props: CalchemyCalendarHeadingProps) {
  const calendar = useCalchemyCalendar();

  return (
    <h2 {...props} calchemy-heading="">
      {props.children ?? formatCalendarWindowLabel(calendar.visiblePeriods, calendar.locale)}
    </h2>
  );
}

export type CalchemyCalendarNavigationProps = Omit<ComponentPropsWithoutRef<"button">, "onClick"> & {
  onClick?: ComponentPropsWithoutRef<"button">["onClick"];
};

export function CalendarPrevious({
  onClick,
  children,
  ...props
}: CalchemyCalendarNavigationProps) {
  return (
    <CalendarNavigationButton
      {...props}
      direction={-1}
      calchemy-previous=""
      onClick={onClick}
    >
      {children ?? "Previous"}
    </CalendarNavigationButton>
  );
}

export function CalendarNext({
  onClick,
  children,
  ...props
}: CalchemyCalendarNavigationProps) {
  return (
    <CalendarNavigationButton
      {...props}
      direction={1}
      calchemy-next=""
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
  direction,
  onClick,
  type = "button",
  ...props
}: CalendarNavigationButtonProps) {
  const calendar = useCalchemyCalendar();
  const moveCount = calendar.period.count * direction;
  const disabled =
    props.disabled ?? !calendar.canMove(calendar.period.unit, moveCount);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled) {
      return;
    }

    calendar.move(calendar.period.unit, moveCount);
  }

  return <button {...props} type={type} disabled={disabled} onClick={handleClick} />;
}
