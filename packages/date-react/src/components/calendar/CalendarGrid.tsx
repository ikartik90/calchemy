import type { ComponentPropsWithoutRef } from "react";
import { useCalchemyCalendar, useCalendarPeriod } from "./context";
import {
  buildCalendarWeeks,
  buildWeekdays,
  getCalendarDayState,
  getFirstVisibleCalendarPeriod,
} from "./date-model";

export type CalchemyCalendarWeekdaysProps = ComponentPropsWithoutRef<"div">;

export function CalendarWeekdays(props: CalchemyCalendarWeekdaysProps) {
  const calendar = useCalchemyCalendar();
  const weekdays = buildWeekdays(calendar);

  return (
    <div {...props} data-calchemy-weekdays="">
      {weekdays.map((weekday) => (
        <div
          key={weekday.index}
          data-calchemy-weekday=""
          data-weekend={weekday.weekend ? "" : undefined}
        >
          {weekday.label}
        </div>
      ))}
    </div>
  );
}

export type CalchemyCalendarGridProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  showBookends?: boolean;
};

export function CalendarGrid({ showBookends = false, ...props }: CalchemyCalendarGridProps) {
  const calendar = useCalchemyCalendar();
  const period = useCalendarPeriod() ?? getFirstVisibleCalendarPeriod(calendar);
  const weeks = buildCalendarWeeks(period, calendar.weekStartsOn);

  return (
    <div {...props} data-calchemy-grid="">
      {weeks.map((week) => (
        <div key={week[0]?.toString()} data-calchemy-week="">
          {week.map((date) => {
            const dayState = getCalendarDayState(calendar, period, date);
            const namedDateLabels = dayState.namedDates.map((item) => item.value).join(", ");
            if (dayState.outside && !showBookends) {
              return (
                <div
                  key={date.toString()}
                  aria-hidden="true"
                  data-calchemy-cell=""
                  data-blank=""
                />
              );
            }

            return (
              <button
                type="button"
                key={date.toString()}
                data-calchemy-day=""
                data-selected={dayState.selected ? "" : undefined}
                data-today={dayState.today ? "" : undefined}
                data-weekend={dayState.weekend ? "" : undefined}
                data-outside={dayState.outside ? "" : undefined}
                data-first-of-period={dayState.firstOfPeriod ? "" : undefined}
                data-last-of-period={dayState.lastOfPeriod ? "" : undefined}
                data-disabled={dayState.disabled ? "" : undefined}
                data-out-of-bounds={!dayState.bounded ? "" : undefined}
                data-named-date={dayState.namedDates.length > 0 ? "" : undefined}
                data-holiday={dayState.namedDates.some((item) => item.isHoliday) ? "" : undefined}
                data-named-date-labels={namedDateLabels || undefined}
                disabled={dayState.disabled}
                onClick={() => {
                  if (!dayState.disabled) {
                    calendar.selectDate(date);
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
