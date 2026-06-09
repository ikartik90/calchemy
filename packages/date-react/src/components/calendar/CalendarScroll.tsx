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
  setScrollPosition,
} from "./scroll-preload";
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
    const currentPeriod = element?.querySelector<HTMLElement>(
      "[data-calchemy-period][data-period-index='0']",
    );
    if (!element || !currentPeriod) {
      return;
    }

    positionedPeriodAnchor.current = anchorKey;
    if (direction === "horizontal") {
      element.scrollLeft = currentPeriod.offsetLeft - element.offsetLeft;
      return;
    }

    element.scrollTop = currentPeriod.offsetTop - element.offsetTop;
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
    const anchorIndex = anchor?.dataset.periodIndex
      ? Number(anchor.dataset.periodIndex)
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
        data-calchemy-scroll=""
        data-direction={direction}
        onScroll={handleScroll}
      />
    </CalendarScrollContext.Provider>
  );
}
