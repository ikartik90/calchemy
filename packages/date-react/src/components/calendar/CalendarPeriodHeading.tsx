import type { ComponentPropsWithoutRef } from "react";
import { useCalchemyCalendar, useCalendarPeriod } from "./context";
import { getFirstVisibleCalendarPeriod } from "./date-model";

export type CalchemyCalendarPeriodHeadingProps = ComponentPropsWithoutRef<"h3">;

export function CalendarPeriodHeading(props: CalchemyCalendarPeriodHeadingProps) {
  const calendar = useCalchemyCalendar();
  const period = useCalendarPeriod() ?? getFirstVisibleCalendarPeriod(calendar);

  return (
    <h3 {...props} calchemy-period-heading="">
      {props.children ?? period.label}
    </h3>
  );
}
