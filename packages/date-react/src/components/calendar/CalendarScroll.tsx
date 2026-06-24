import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, UIEvent } from "react";
import { flushSync } from "react-dom";
import { CalendarScrollContext, useCalchemyCalendar } from "./context";
import {
  getCalendarPeriodWindowSize,
  getClientSize,
  getLoadedPeriodRunway,
  getScrollAnchorPeriod,
  getScrollPosition,
  getScrollSize,
  scrollPeriodIntoView,
  setScrollPosition,
} from "./scroll-preload";

function isCurrentPeriodAligned(
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
): boolean {
  const anchor = getScrollAnchorPeriod(scrollElement, direction);
  return anchor?.getAttribute("calchemy-period-index") === "0";
}
import type { CalendarScrollDirection } from "./types";

const preloadWindowCount = 2;

export type CalchemyCalendarScrollProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "onScroll"
> & {
  direction?: CalendarScrollDirection;
  onScroll?: ComponentPropsWithoutRef<"div">["onScroll"];
};

export function CalendarScroll({
  direction = "vertical",
  onScroll,
  ...props
}: CalchemyCalendarScrollProps) {
  const calendar = useCalchemyCalendar();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [leadingSpacer, setLeadingSpacer] = useState({
    periodCount: 0,
    pixelSize: 0,
  });
  const positionedPeriodAnchor = useRef<string | null>(null);
  const suppressPreloadEvaluation = useRef(false);
  const pendingPrependStabilization = useRef<{
    direction: CalendarScrollDirection;
    insertedDelta: number;
    targetPosition: number;
  } | null>(null);

  useLayoutEffect(() => {
    const anchorKey = calendar.periodAnchor.toString();
    if (positionedPeriodAnchor.current === anchorKey) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    const alignToCurrentPeriod = () => {
      if (cancelled || positionedPeriodAnchor.current === anchorKey) {
        return;
      }

      const currentPeriod = element.querySelector<HTMLElement>(
        "[calchemy-period][calchemy-period-index='0']",
      );
      if (!currentPeriod) {
        return;
      }

      calendar.navigationSync.suppressScrollSync = true;
      scrollPeriodIntoView(element, currentPeriod, direction, { instant: true });

      if (isCurrentPeriodAligned(element, direction)) {
        positionedPeriodAnchor.current = anchorKey;
        calendar.setVisiblePeriodIndex(0);
        calendar.navigationSync.suppressScrollSync = false;
        return;
      }

      calendar.navigationSync.suppressScrollSync = false;
    };

    alignToCurrentPeriod();

    if (positionedPeriodAnchor.current === anchorKey) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      alignToCurrentPeriod();
    });

    if (typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      alignToCurrentPeriod();
    });
    resizeObserver.observe(element);
    const periodList = element.querySelector<HTMLElement>("[calchemy-period-list]");
    if (periodList) {
      resizeObserver.observe(periodList);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [direction, calendar.periodAnchor, calendar.periods]);

  function startBeforePreloadTransaction(
    element: HTMLDivElement,
    preloadDirection: CalendarScrollDirection,
    periodWindowSize: number,
  ) {
    suppressPreloadEvaluation.current = true;
    const extendPeriodCount = calendar.period.count * preloadWindowCount;
    const previousScrollSize = getScrollSize(element, preloadDirection);
    const previousScrollPosition = getScrollPosition(element, preloadDirection);

    flushSync(() => {
      setLeadingSpacer({
        periodCount: extendPeriodCount,
        pixelSize: periodWindowSize * preloadWindowCount,
      });
    });

    setScrollPosition(
      element,
      preloadDirection,
      previousScrollPosition +
        getScrollSize(element, preloadDirection) -
        previousScrollSize,
    );

    flushSync(() => {
      calendar.extendPeriods("before", preloadWindowCount);
      setLeadingSpacer({ periodCount: 0, pixelSize: 0 });
    });

    const insertedDelta =
      getScrollSize(element, preloadDirection) - previousScrollSize;
    const targetPosition = previousScrollPosition + insertedDelta;
    setScrollPosition(element, preloadDirection, targetPosition);
    pendingPrependStabilization.current = {
      direction: preloadDirection,
      insertedDelta,
      targetPosition,
    };
  }

  function stabilizePrependScrollEvent(element: HTMLDivElement) {
    const stabilization = pendingPrependStabilization.current;
    if (!stabilization) {
      suppressPreloadEvaluation.current = false;
      return;
    }

    const observedPosition = getScrollPosition(
      element,
      stabilization.direction,
    );
    const targetDistance = observedPosition - stabilization.targetPosition;
    const staleCoordinate =
      Math.abs(
        observedPosition +
          stabilization.insertedDelta -
          stabilization.targetPosition,
      ) < Math.abs(targetDistance);

    if (staleCoordinate) {
      setScrollPosition(
        element,
        stabilization.direction,
        observedPosition + stabilization.insertedDelta,
      );
    }

    pendingPrependStabilization.current = null;
    suppressPreloadEvaluation.current = false;
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    onScroll?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const element = event.currentTarget;
    if (calendar.navigationSync.suppressScrollSync) {
      return;
    }

    if (suppressPreloadEvaluation.current) {
      stabilizePrependScrollEvent(element);
      return;
    }

    if (
      getScrollSize(element, direction) <= getClientSize(element, direction)
    ) {
      return;
    }

    const anchor = getScrollAnchorPeriod(element, direction);
    const anchorIndex = anchor?.getAttribute("calchemy-period-index")
      ? Number(anchor.getAttribute("calchemy-period-index"))
      : NaN;
    if (Number.isFinite(anchorIndex)) {
      calendar.setVisiblePeriodIndex(anchorIndex);
    }

    const periodWindowSize = getCalendarPeriodWindowSize(
      element,
      direction,
      calendar.period.count,
    );
    const startRunway = getLoadedPeriodRunway(calendar, anchor, "before");
    const runwayThreshold = calendar.period.count * preloadWindowCount;
    const endRunway = getLoadedPeriodRunway(calendar, anchor, "after");
    if (
      startRunway !== null &&
      startRunway <= runwayThreshold &&
      calendar.canExtendPeriods("before", preloadWindowCount)
    ) {
      startBeforePreloadTransaction(element, direction, periodWindowSize);
    }
    if (
      endRunway !== null &&
      endRunway <= runwayThreshold &&
      calendar.canExtendPeriods("after", preloadWindowCount)
    ) {
      calendar.extendPeriods("after", preloadWindowCount);
    }
  }

  return (
    <CalendarScrollContext.Provider
      value={{
        direction,
        leadingSpacerPeriodCount: leadingSpacer.periodCount,
        leadingSpacerPixelSize: leadingSpacer.pixelSize,
      }}
    >
      <div
        {...props}
        ref={scrollRef}
        calchemy-scroll=""
        calchemy-direction={direction}
        onScroll={handleScroll}
      />
    </CalendarScrollContext.Provider>
  );
}
