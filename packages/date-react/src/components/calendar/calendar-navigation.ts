import type { RefObject } from "react";
import {
  animateScrollPosition,
  getClientSize,
  getLoadedPeriodRunway,
  getScrollAnchorPeriod,
  getScrollOffsetToPeriod,
  getScrollPosition,
  getScrollSize,
  setScrollPosition,
} from "./scroll-preload";
import type { CalendarScrollDirection, CalendarState } from "./types";

const preloadWindowCount = 2;

export type CalendarNavigationRefs = {
  periodIndexRef: RefObject<number | null>;
  animationCancelRef: RefObject<(() => void) | null>;
  syncRef: RefObject<{ suppressScrollSync: boolean }>;
};

export function navigateCalendarWindow(
  calendar: CalendarState,
  calendarElement: HTMLElement,
  windowDirection: -1 | 1,
  refs: CalendarNavigationRefs,
  onStaticCommit: () => void,
): void {
  const scrollElement = calendarElement.querySelector<HTMLElement>("[calchemy-scroll]");
  const scrollDirection = getScrollDirection(scrollElement);

  if (
    scrollElement &&
    getScrollSize(scrollElement, scrollDirection) > getClientSize(scrollElement, scrollDirection) &&
    navigateViaScroll(calendar, scrollElement, scrollDirection, windowDirection, refs)
  ) {
    return;
  }

  const slideTarget = findSlideTarget(calendarElement);
  if (slideTarget) {
    animateStaticWindow(
      slideTarget,
      scrollDirection,
      windowDirection,
      refs,
      onStaticCommit,
    );
    return;
  }

  onStaticCommit();
}

function navigateViaScroll(
  calendar: CalendarState,
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
  windowDirection: -1 | 1,
  refs: CalendarNavigationRefs,
): boolean {
  const anchorIndex =
    refs.periodIndexRef.current ?? calendar.visiblePeriods[0]?.index;
  if (anchorIndex === undefined) {
    return false;
  }

  const targetIndex = anchorIndex + windowDirection * calendar.period.count;
  refs.periodIndexRef.current = targetIndex;

  ensureScrollRunway(calendar, scrollElement, direction, windowDirection);

  const targetPeriod = scrollElement.querySelector<HTMLElement>(
    `[calchemy-period-index='${targetIndex}']`,
  );
  if (!targetPeriod) {
    refs.periodIndexRef.current = anchorIndex;
    return false;
  }

  refs.animationCancelRef.current?.();
  refs.syncRef.current.suppressScrollSync = true;
  calendar.setVisiblePeriodIndex(targetIndex);
  refs.animationCancelRef.current = animateScrollPosition(
    scrollElement,
    direction,
    getScrollOffsetToPeriod(scrollElement, targetPeriod, direction),
    {
      onComplete: () => {
        refs.animationCancelRef.current = null;
        refs.syncRef.current.suppressScrollSync = false;
      },
    },
  );

  return true;
}

function ensureScrollRunway(
  calendar: CalendarState,
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
  windowDirection: -1 | 1,
): void {
  const runwayThreshold = calendar.period.count * preloadWindowCount;
  const anchor = getScrollAnchorPeriod(scrollElement, direction);

  if (windowDirection < 0) {
    const startRunway = getLoadedPeriodRunway(calendar, anchor, "before");
    if (
      startRunway !== null &&
      startRunway <= runwayThreshold + calendar.period.count &&
      calendar.canExtendPeriods("before", preloadWindowCount)
    ) {
      const previousScrollSize = getScrollSize(scrollElement, direction);
      const previousScrollPosition = getScrollPosition(scrollElement, direction);
      calendar.extendPeriods("before", preloadWindowCount);
      setScrollPosition(
        scrollElement,
        direction,
        previousScrollPosition +
          (getScrollSize(scrollElement, direction) - previousScrollSize),
      );
    }
    return;
  }

  const endRunway = getLoadedPeriodRunway(calendar, anchor, "after");
  if (
    endRunway !== null &&
    endRunway <= runwayThreshold + calendar.period.count &&
    calendar.canExtendPeriods("after", preloadWindowCount)
  ) {
    calendar.extendPeriods("after", preloadWindowCount);
  }
}

function animateStaticWindow(
  slideTarget: HTMLElement,
  direction: CalendarScrollDirection,
  windowDirection: -1 | 1,
  refs: CalendarNavigationRefs,
  onStaticCommit: () => void,
): void {
  refs.animationCancelRef.current?.();
  refs.syncRef.current.suppressScrollSync = true;

  const slideDistance =
    direction === "horizontal" ? slideTarget.offsetWidth : slideTarget.offsetHeight;
  if (slideDistance <= 0) {
    onStaticCommit();
    refs.syncRef.current.suppressScrollSync = false;
    return;
  }

  const offset = -windowDirection * slideDistance;
  const axisProperty = direction === "horizontal" ? "translateX" : "translateY";

  refs.animationCancelRef.current = animateElementTransform(
    slideTarget,
    `${axisProperty}(0px)`,
    `${axisProperty}(${offset}px)`,
    () => {
      onStaticCommit();
      slideTarget.style.transform = `${axisProperty}(${-offset}px)`;
      return `${axisProperty}(0px)`;
    },
    () => {
      slideTarget.style.removeProperty("transform");
      slideTarget.style.removeProperty("transition");
      refs.animationCancelRef.current = null;
      refs.syncRef.current.suppressScrollSync = false;
    },
  );
}

function animateElementTransform(
  element: HTMLElement,
  fromTransform: string,
  midTransform: string,
  onMidpoint: () => string,
  onComplete: () => void,
): () => void {
  if (prefersReducedMotion()) {
    onMidpoint();
    onComplete();
    return () => {};
  }

  const durationMs = 280;
  let startTime: number | null = null;
  let frame = 0;
  let cancelled = false;
  let midpointReached = false;
  let endTransform = midTransform;

  element.style.transform = fromTransform;

  const step = (timestamp: number) => {
    if (cancelled) {
      return;
    }

    startTime ??= timestamp;
    const progress = Math.min((timestamp - startTime) / durationMs, 1);

    if (!midpointReached && progress >= 0.5) {
      midpointReached = true;
      endTransform = onMidpoint();
    }

    const localProgress = midpointReached
      ? (progress - 0.5) / 0.5
      : progress / 0.5;
    const eased = easeOutCubic(Math.min(Math.max(localProgress, 0), 1));
    element.style.transform = midpointReached
      ? interpolateTransform(endTransform, fromTransform, eased)
      : interpolateTransform(fromTransform, midTransform, eased);

    if (progress < 1) {
      frame = requestAnimationFrame(step);
      return;
    }

    onComplete();
  };

  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

function interpolateTransform(from: string, to: string, progress: number): string {
  const fromValue = parseTransformOffset(from);
  const toValue = parseTransformOffset(to);
  const current = fromValue + (toValue - fromValue) * progress;
  const axis = from.includes("translateX") ? "translateX" : "translateY";
  return `${axis}(${current}px)`;
}

function parseTransformOffset(transform: string): number {
  const match = transform.match(/translate(?:X|Y)\(([-\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getScrollDirection(
  scrollElement: HTMLElement | null,
): CalendarScrollDirection {
  return scrollElement?.getAttribute("calchemy-direction") === "horizontal"
    ? "horizontal"
    : "vertical";
}

function findSlideTarget(calendarElement: HTMLElement): HTMLElement | null {
  return (
    calendarElement.querySelector<HTMLElement>("[calchemy-period-list]") ??
    calendarElement.querySelector<HTMLElement>("[calchemy-period]") ??
    calendarElement.querySelector<HTMLElement>("[calchemy-grid]")
  );
}
