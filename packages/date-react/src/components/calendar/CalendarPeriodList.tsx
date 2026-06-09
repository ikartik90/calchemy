import { useContext } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { CalendarPeriodContext, CalendarScrollContext, useCalchemyCalendar } from "./context";
import { CalendarGrid, CalendarWeekdays } from "./CalendarGrid";
import { CalendarPeriodHeading } from "./CalendarPeriodHeading";
import { CalendarPeriod } from "./CalendarPeriod";

export type CalchemyCalendarPeriodListProps = ComponentPropsWithoutRef<"div">;

export function CalendarPeriodList({
  children,
  ...props
}: CalchemyCalendarPeriodListProps) {
  const calendar = useCalchemyCalendar();
  const scrollContext = useContext(CalendarScrollContext);
  const periods = scrollContext ? calendar.periods : calendar.visiblePeriods;
  const spacerStyle =
    scrollContext?.direction === "horizontal"
      ? { gridColumn: `span ${scrollContext.leadingSpacerPeriodCount}` }
      : { blockSize: `${scrollContext?.leadingSpacerPixelSize ?? 0}px` };

  return (
    <div {...props} data-calchemy-period-list="">
      {scrollContext && scrollContext.leadingSpacerPeriodCount > 0 ? (
        <div
          aria-hidden="true"
          data-calchemy-scroll-spacer=""
          style={spacerStyle}
        />
      ) : null}
      {periods.map((period) => (
        <CalendarPeriodContext.Provider key={period.id} value={period}>
          {children ?? (
            <CalendarPeriod>
              <CalendarPeriodHeading />
              <CalendarWeekdays />
              <CalendarGrid />
            </CalendarPeriod>
          )}
        </CalendarPeriodContext.Provider>
      ))}
    </div>
  );
}
