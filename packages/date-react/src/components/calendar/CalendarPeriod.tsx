import { useContext } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { CalendarPeriodContext } from "./context";
import {
  CalendarDragRectangleOverlay,
  CalendarPeriodDragProvider,
  multipleDragSurfaceStyle,
  useCalendarPeriodDragSurface,
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
  const drag = useCalendarPeriodDragSurface(dragSelection);

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
      data-calchemy-period=""
      data-period-id={period?.id}
      data-period-index={period?.index}
      data-multiple-drag={drag ? "" : undefined}
      data-dragging={drag?.dragState ? "" : undefined}
      style={drag ? { ...multipleDragSurfaceStyle, ...style } : style}
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
