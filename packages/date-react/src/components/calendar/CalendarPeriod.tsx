import { useContext } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { CalendarPeriodContext, useCalchemyCalendar } from "./context";
import {
  CalendarDragRectangleOverlay,
  CalendarPeriodDragProvider,
  mergeCalendarDragPointerProps,
  multipleDragSurfaceStyle,
  useCalendarPeriodDragSurface,
  useOptionalCalendarPeriodDrag,
} from "./calendar-period-drag";

export type CalchemyCalendarPeriodProps = ComponentPropsWithoutRef<"section"> & {
  dragSelection?: boolean;
};

export function CalendarPeriod({
  dragSelection = true,
  style,
  children,
  onPointerDownCapture,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDragStart,
  ...props
}: CalchemyCalendarPeriodProps) {
  const period = useContext(CalendarPeriodContext);
  const calendar = useCalchemyCalendar();
  const parentDrag = useOptionalCalendarPeriodDrag();
  const drag = useCalendarPeriodDragSurface(
    calendar.editable && dragSelection && parentDrag === null,
  );

  const content = drag ? (
    <CalendarPeriodDragProvider value={drag}>
      <CalendarDragRectangleOverlay />
      {children}
    </CalendarPeriodDragProvider>
  ) : (
    children
  );
  const dragPointerProps = mergeCalendarDragPointerProps(Boolean(drag), drag, {
    onPointerDownCapture,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDragStart,
  });

  return (
    <section
      {...props}
      calchemy-period=""
      calchemy-period-id={period?.id}
      calchemy-period-index={period?.index}
      calchemy-multiple-drag={drag ? "" : undefined}
      calchemy-dragging={drag?.dragState ? "" : undefined}
      style={
        drag
          ? { ...multipleDragSurfaceStyle, ...style }
          : parentDrag
            ? { touchAction: "none", ...style }
            : style
      }
      {...dragPointerProps}
    >
      {content}
    </section>
  );
}
