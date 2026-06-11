import { useContext } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { CalendarPeriodContext, useCalchemyCalendar } from "./context";
import {
  CalendarDragRectangleOverlay,
  CalendarPeriodDragProvider,
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
      onPointerDownCapture={
        drag
          ? (event) => {
              drag.handlePointerDownCapture(event);
              onPointerDownCapture?.(event);
            }
          : onPointerDownCapture
      }
      onPointerMove={
        drag
          ? (event) => {
              drag.handlePointerMove(event);
              onPointerMove?.(event);
            }
          : onPointerMove
      }
      onPointerUp={
        drag
          ? (event) => {
              drag.handlePointerUp(event);
              onPointerUp?.(event);
            }
          : onPointerUp
      }
      onPointerCancel={
        drag
          ? (event) => {
              drag.handlePointerCancel(event);
              onPointerCancel?.(event);
            }
          : onPointerCancel
      }
      onDragStart={
        drag
          ? (event) => {
              event.preventDefault();
              onDragStart?.(event);
            }
          : onDragStart
      }
    >
      {content}
    </section>
  );
}
