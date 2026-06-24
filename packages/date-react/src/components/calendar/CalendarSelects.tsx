import type { ComponentPropsWithoutRef, ChangeEvent } from "react";
import type { PlainDate } from "@calchemy/date-core";
import { useCalchemyCalendar } from "./context";
import { formatMonthLabel, isAfter, isBefore } from "./date-model";

export type CalchemyCalendarMonthSelectProps = Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange"> & {
  onChange?: ComponentPropsWithoutRef<"select">["onChange"];
};

export function CalendarMonthSelect({ onChange, disabled, ...props }: CalchemyCalendarMonthSelectProps) {
  const calendar = useCalchemyCalendar();
  const months = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) =>
    isMonthWithinBounds(calendar.visiblePeriodAnchor.with({ month, day: 1 }), calendar),
  );

  return (
    <select
      {...props}
      calchemy-month-select=""
      disabled={disabled ?? calendar.isNavigating}
      value={String(calendar.visiblePeriodAnchor.month)}
      onChange={(event) =>
        handleCalendarSelectChange(event, onChange, (value) => {
          const target = calendar.visiblePeriodAnchor.with({ month: value, day: 1 });
          calendar.navigateTo(target, compareNavigationDirection(target, calendar.visiblePeriodAnchor));
        })
      }
    >
      {months.map((month) => {
        const date = calendar.visiblePeriodAnchor.with({ month, day: 1 });
        return (
          <option key={month} value={String(month)}>
            {formatMonthLabel(date, calendar.locale)}
          </option>
        );
      })}
    </select>
  );
}

export type CalchemyCalendarYearSelectProps = Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange"> & {
  startYear?: number;
  endYear?: number;
  onChange?: ComponentPropsWithoutRef<"select">["onChange"];
};

export function CalendarYearSelect({
  startYear,
  endYear,
  onChange,
  disabled,
  ...props
}: CalchemyCalendarYearSelectProps) {
  const calendar = useCalchemyCalendar();
  const visibleYear = calendar.visiblePeriodAnchor.year;
  const firstYear = Math.min(calendar.bounds?.start?.year ?? startYear ?? visibleYear - 100, visibleYear);
  const lastYear = Math.max(calendar.bounds?.end?.year ?? endYear ?? visibleYear + 100, visibleYear);

  return (
    <select
      {...props}
      calchemy-year-select=""
      disabled={disabled ?? calendar.isNavigating}
      value={String(visibleYear)}
      onChange={(event) =>
        handleCalendarSelectChange(event, onChange, (value) => {
          const target = calendar.visiblePeriodAnchor.with({ year: value, day: 1 });
          calendar.navigateTo(target, compareNavigationDirection(target, calendar.visiblePeriodAnchor));
        })
      }
    >
      {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((year) => (
        <option key={year} value={String(year)}>
          {year}
        </option>
      ))}
    </select>
  );
}

function handleCalendarSelectChange(
  event: ChangeEvent<HTMLSelectElement>,
  onChange: ComponentPropsWithoutRef<"select">["onChange"] | undefined,
  updatePeriodAnchor: (value: number) => void,
): void {
  onChange?.(event);
  if (event.defaultPrevented) {
    return;
  }

  updatePeriodAnchor(Number(event.currentTarget.value));
}

function compareNavigationDirection(target: PlainDate, anchor: PlainDate): 1 | -1 {
  if (isBefore(target, anchor)) {
    return -1;
  }

  return 1;
}

function isMonthWithinBounds(
  monthStart: ReturnType<typeof useCalchemyCalendar>["visiblePeriodAnchor"],
  calendar: ReturnType<typeof useCalchemyCalendar>,
): boolean {
  const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 });

  return (
    (!calendar.bounds?.start || !isBefore(monthEnd, calendar.bounds.start)) &&
    (!calendar.bounds?.end || !isAfter(monthStart, calendar.bounds.end))
  );
}
