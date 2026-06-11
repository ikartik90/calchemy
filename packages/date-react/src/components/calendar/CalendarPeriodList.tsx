import { useContext, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { CalendarPeriodContext, CalendarScrollContext, useCalchemyCalendar } from "./context";
import { CalendarGrid, CalendarWeekdays } from "./CalendarGrid";
import { CalendarPeriodHeading } from "./CalendarPeriodHeading";
import { CalendarPeriod } from "./CalendarPeriod";
import {
  CalendarDragRectangleOverlay,
  CalendarPeriodDragProvider,
  multiplePeriodListDragSurfaceStyle,
  useCalendarPeriodDragSurface,
  useOptionalCalendarPeriodDrag,
} from "./calendar-period-drag";

export type CalchemyCalendarPeriodListProps = ComponentPropsWithoutRef<"div"> & {
  dragSelection?: boolean;
};

export function CalendarPeriodList({
  children,
  dragSelection = true,
  style,
  onPointerDownCapture,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDragStart,
  ...props
}: CalchemyCalendarPeriodListProps) {
  const calendar = useCalchemyCalendar();
  const scrollContext = useContext(CalendarScrollContext);
  const parentDrag = useOptionalCalendarPeriodDrag();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const hitCaptureRef = useRef<HTMLDivElement | null>(null);
  const drag = useCalendarPeriodDragSurface(
    calendar.editable && dragSelection && parentDrag === null,
    surfaceRef,
  );
  const periods = scrollContext ? calendar.periods : calendar.visiblePeriods;

  useLayoutEffect(() => {
    if (!drag) {
      return;
    }

    const surface = surfaceRef.current;
    const hitCapture = hitCaptureRef.current;
    if (!surface || !hitCapture) {
      return;
    }

    const updateDragHitBounds = () => {
      const periodElements = surface.querySelectorAll<HTMLElement>("[calchemy-period]");
      if (periodElements.length === 0) {
        hitCapture.style.removeProperty("inline-size");
        hitCapture.style.removeProperty("block-size");
        return;
      }

      let maxInlineEnd = 0;
      let maxBlockEnd = 0;
      for (const periodElement of periodElements) {
        maxInlineEnd = Math.max(maxInlineEnd, periodElement.offsetLeft + periodElement.offsetWidth);
        maxBlockEnd = Math.max(maxBlockEnd, periodElement.offsetTop + periodElement.offsetHeight);
      }

      hitCapture.style.inlineSize = `${maxInlineEnd}px`;
      hitCapture.style.blockSize = `${maxBlockEnd}px`;
    };

    updateDragHitBounds();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateDragHitBounds);
    resizeObserver.observe(surface);
    for (const periodElement of surface.querySelectorAll<HTMLElement>("[calchemy-period]")) {
      resizeObserver.observe(periodElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [drag, periods]);

  const spacerStyle =
    scrollContext?.direction === "horizontal"
      ? { gridColumn: `span ${scrollContext.leadingSpacerPeriodCount}` }
      : { blockSize: `${scrollContext?.leadingSpacerPixelSize ?? 0}px` };

  const periodContent = (
    <>
      {scrollContext && scrollContext.leadingSpacerPeriodCount > 0 ? (
        <div
          aria-hidden="true"
          calchemy-scroll-spacer=""
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
    </>
  );

  const content = drag ? (
    <CalendarPeriodDragProvider value={drag}>
      <div
        ref={hitCaptureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 0,
          pointerEvents: "auto",
          touchAction: "none",
        }}
      />
      <CalendarDragRectangleOverlay />
      {periodContent}
    </CalendarPeriodDragProvider>
  ) : (
    periodContent
  );

  return (
    <div
      {...props}
      ref={surfaceRef}
      calchemy-period-list=""
      calchemy-multiple-drag={drag ? "" : undefined}
      calchemy-dragging={drag?.dragState ? "" : undefined}
      style={drag ? { ...multiplePeriodListDragSurfaceStyle, ...style } : style}
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
    </div>
  );
}
