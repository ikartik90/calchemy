import { useMemo } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { useCalchemyCalendar, useCalendarPeriod } from "./context";
import {
  CalendarDragRectangleOverlay,
  getMultipleDates,
  getSelectedDateKeys,
  multipleDragSurfaceStyle,
  toggleDateKeys,
  useCalendarPeriodDragSurface,
  useOptionalCalendarPeriodDrag,
} from "./calendar-period-drag";
import type { CalendarWeekdayFormat } from "./types";
import {
  buildCalendarWeeks,
  buildWeekdays,
  getCalendarDayState,
  getFirstVisibleCalendarPeriod,
} from "./date-model";

const defaultCalendarWeekdayFormat = "short" satisfies CalendarWeekdayFormat;

export type CalchemyCalendarWeekdaysProps = ComponentPropsWithoutRef<"div"> & {
  weekdayFormat?: CalendarWeekdayFormat;
};

export function CalendarWeekdays({
  weekdayFormat = defaultCalendarWeekdayFormat,
  ...props
}: CalchemyCalendarWeekdaysProps) {
  const calendar = useCalchemyCalendar();
  const weekdays = buildWeekdays(calendar, weekdayFormat);

  return (
    <div {...props} calchemy-days="">
      {weekdays.map((weekday) => (
        <div
          key={weekday.index}
          calchemy-weekday=""
          calchemy-weekend={weekday.weekend ? "" : undefined}
        >
          {weekday.label}
        </div>
      ))}
    </div>
  );
}

export type CalchemyCalendarGridProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  showBookends?: boolean;
  dragSelection?: boolean;
};

export function CalendarGrid({
  showBookends = false,
  dragSelection = true,
  style,
  onPointerDownCapture,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDragStart,
  ...props
}: CalchemyCalendarGridProps) {
  const calendar = useCalchemyCalendar();
  const period = useCalendarPeriod() ?? getFirstVisibleCalendarPeriod(calendar);
  const weeks = buildCalendarWeeks(period, calendar.weekStartsOn);
  const parentDrag = useOptionalCalendarPeriodDrag();
  const localDrag = useCalendarPeriodDragSurface(
    calendar.editable && dragSelection && parentDrag === null,
  );
  const drag = parentDrag ?? localDrag;
  const multipleSelection = Boolean(drag?.multipleSelection);
  const useLocalDragHandlers = Boolean(drag && parentDrag === null);
  const committedSelectedKeys = useMemo(() => new Set(getSelectedDateKeys(calendar.selected)), [calendar.selected]);
  const previewSelectedKeys = drag?.previewSelectedKeys ?? new Set<string>();
  const dragState = drag?.dragState ?? null;

  return (
    <div
      {...props}
      calchemy-grid=""
      calchemy-multiple-drag={useLocalDragHandlers ? "" : undefined}
      calchemy-dragging={useLocalDragHandlers && dragState ? "" : undefined}
      style={useLocalDragHandlers ? { ...multipleDragSurfaceStyle, ...style } : style}
      onPointerDownCapture={
        useLocalDragHandlers
          ? (event) => {
              drag?.handlePointerDownCapture(event);
              onPointerDownCapture?.(event);
            }
          : onPointerDownCapture
      }
      onPointerMove={
        useLocalDragHandlers
          ? (event) => {
              drag?.handlePointerMove(event);
              onPointerMove?.(event);
            }
          : onPointerMove
      }
      onPointerUp={
        useLocalDragHandlers
          ? (event) => {
              drag?.handlePointerUp(event);
              onPointerUp?.(event);
            }
          : onPointerUp
      }
      onPointerCancel={
        useLocalDragHandlers
          ? (event) => {
              drag?.handlePointerCancel(event);
              onPointerCancel?.(event);
            }
          : onPointerCancel
      }
      onDragStart={
        useLocalDragHandlers
          ? (event) => {
              event.preventDefault();
              onDragStart?.(event);
            }
          : onDragStart
      }
    >
      {useLocalDragHandlers && drag?.dragRectangle ? (
        <CalendarDragRectangleOverlay dragRectangle={drag.dragRectangle} surfaceRef={drag.surfaceRef} />
      ) : null}
      {weeks.map((week) => (
        <div key={week[0]?.toString()} calchemy-week="">
          {week.map((date) => {
            const dayState = getCalendarDayState(calendar, period, date);
            const namedDateLabels = dayState.namedDates.map((item) => item.value).join(", ");
            const dateKey = date.toString();
            const selected = multipleSelection
              ? dragState
                ? previewSelectedKeys.has(dateKey)
                : committedSelectedKeys.has(dateKey)
              : dayState.selected;
            const dragPreview = Boolean(dragState && selected !== dayState.selected);
            if (dayState.outside && !showBookends) {
              return (
                <div
                  key={date.toString()}
                  aria-hidden="true"
                  calchemy-cell=""
                  calchemy-blank=""
                />
              );
            }

            return (
              <button
                type="button"
                key={date.toString()}
                ref={(element) =>
                  drag?.registerDay(element, date, dayState.disabled || !calendar.editable)
                }
                calchemy-date=""
                calchemy-selected={selected ? "" : undefined}
                calchemy-drag-preview={dragPreview ? "" : undefined}
                calchemy-drag-preview-selected={dragPreview && selected ? "" : undefined}
                calchemy-drag-preview-deselected={dragPreview && !selected ? "" : undefined}
                calchemy-today={dayState.today ? "" : undefined}
                calchemy-weekend={dayState.weekend ? "" : undefined}
                calchemy-outside={dayState.outside ? "" : undefined}
                calchemy-first-of-period={dayState.firstOfPeriod ? "" : undefined}
                calchemy-last-of-period={dayState.lastOfPeriod ? "" : undefined}
                calchemy-disabled={dayState.disabled ? "" : undefined}
                calchemy-out-of-bounds={!dayState.bounded ? "" : undefined}
                calchemy-named-date={dayState.namedDates.length > 0 ? "" : undefined}
                calchemy-holiday={dayState.namedDates.some((item) => item.isHoliday) ? "" : undefined}
                calchemy-named-date-labels={namedDateLabels || undefined}
                aria-disabled={!calendar.editable && !dayState.disabled ? true : undefined}
                disabled={dayState.disabled}
                onClick={() => {
                  if (!calendar.editable) {
                    return;
                  }

                  if (drag?.suppressClickRef.current) {
                    drag.suppressClickRef.current = false;
                    return;
                  }
                  if (!dayState.disabled) {
                    if (multipleSelection) {
                      const selectedDates = getMultipleDates(calendar.selected);
                      const nextKeys = toggleDateKeys(
                        selectedDates.map((selectedDate) => selectedDate.toString()),
                        [dateKey],
                      );
                      const nextDates = nextKeys.flatMap((key) => {
                        if (key === dateKey) {
                          return [date];
                        }

                        const existing = selectedDates.find((selectedDate) => selectedDate.toString() === key);
                        return existing ? [existing] : [];
                      });
                      calendar.selectValue({
                        kind: "multiple",
                        dates: nextDates,
                      });
                    } else {
                      calendar.selectDate(date);
                    }
                  }
                }}
              >
                {date.day}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
