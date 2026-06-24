import type { RefObject } from "react";
import type { PlainDate } from "@calchemy/date-core";
import { isAfter, isBefore } from "./date-model";
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
const motionProperties = new Set(["transform", "opacity"]);

export type CalendarNavPhase = "out" | "in";

export type CalendarNavigationRefs = {
  periodIndexRef: RefObject<number | null>;
  animationCancelRef: RefObject<(() => void) | null>;
  syncRef: RefObject<{ suppressScrollSync: boolean }>;
};

export function findNavigationSlideTarget(calendarElement: HTMLElement): HTMLElement | null {
  return (
    calendarElement.querySelector<HTMLElement>("[calchemy-period-list]") ??
    calendarElement.querySelector<HTMLElement>("[calchemy-period]") ??
    calendarElement.querySelector<HTMLElement>("[calchemy-grid]")
  );
}

export function getScrollDirection(
  scrollElement: HTMLElement | null,
): CalendarScrollDirection {
  return scrollElement?.getAttribute("calchemy-direction") === "horizontal"
    ? "horizontal"
    : "vertical";
}

export function applySlideTargetNav(
  slideTarget: HTMLElement,
  phase: CalendarNavPhase,
  direction: 1 | -1,
): void {
  slideTarget.setAttribute("calchemy-nav", phase);
  slideTarget.style.setProperty("--calchemy-nav-direction", String(direction));
}

export function clearSlideTargetNav(slideTarget: HTMLElement): void {
  slideTarget.removeAttribute("calchemy-nav");
  slideTarget.style.removeProperty("--calchemy-nav-direction");
  slideTarget.style.removeProperty("transform");
  slideTarget.style.removeProperty("transition");
}

function waitForMotionEnd(element: HTMLElement): Promise<void> {
  const computed = getComputedStyle(element);
  const durationMs = Math.max(
    parseDurationMs(computed.transitionDuration),
    parseDurationMs(computed.animationDuration),
  );

  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      element.removeEventListener("transitionend", onTransitionEnd);
      element.removeEventListener("animationend", onAnimationEnd);
      window.clearTimeout(timeoutId);
      resolve();
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element || !motionProperties.has(event.propertyName)) {
        return;
      }

      finish();
    };

    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== element) {
        return;
      }

      finish();
    };

    element.addEventListener("transitionend", onTransitionEnd);
    element.addEventListener("animationend", onAnimationEnd);
    const timeoutId = window.setTimeout(finish, durationMs + 50);
  });
}

function parseDurationMs(value: string): number {
  return value
    .split(",")
    .reduce((max, part) => {
      const trimmed = part.trim();
      if (!trimmed) {
        return max;
      }

      if (trimmed.endsWith("ms")) {
        return Math.max(max, Number.parseFloat(trimmed));
      }

      if (trimmed.endsWith("s")) {
        return Math.max(max, Number.parseFloat(trimmed) * 1000);
      }

      return max;
    }, 0);
}

export async function runStaticNavigation(options: {
  slideTarget: HTMLElement;
  direction: 1 | -1;
  animated: boolean;
  commit: () => void;
  onPhaseChange?: (phase: CalendarNavPhase | null) => void;
}): Promise<void> {
  const { slideTarget, direction, animated, commit, onPhaseChange } = options;

  if (!animated) {
    commit();
    return;
  }

  onPhaseChange?.("out");
  applySlideTargetNav(slideTarget, "out", direction);

  if (!hasMotion(slideTarget)) {
    commit();
    onPhaseChange?.("in");
    applySlideTargetNav(slideTarget, "in", direction);
    clearSlideTargetNav(slideTarget);
    onPhaseChange?.(null);
    return;
  }

  await waitForMotionEnd(slideTarget);

  commit();

  slideTarget.style.transition = "none";
  slideTarget.style.transform = `translateX(${direction * 100}%)`;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  slideTarget.style.removeProperty("transition");
  slideTarget.style.removeProperty("transform");
  onPhaseChange?.("in");
  applySlideTargetNav(slideTarget, "in", direction);

  if (!hasMotion(slideTarget)) {
    clearSlideTargetNav(slideTarget);
    onPhaseChange?.(null);
    return;
  }

  await waitForMotionEnd(slideTarget);

  clearSlideTargetNav(slideTarget);
  onPhaseChange?.(null);
}

function hasMotion(element: HTMLElement): boolean {
  const computed = getComputedStyle(element);
  return (
    parseDurationMs(computed.transitionDuration) > 0 ||
    parseDurationMs(computed.animationDuration) > 0
  );
}

export function resolveScrollTargetIndex(
  calendar: CalendarState,
  targetAnchor: PlainDate,
): number | null {
  const match = calendar.periods.find(
    (period) => !isBefore(targetAnchor, period.start) && !isAfter(targetAnchor, period.end),
  );

  return match?.index ?? null;
}

export function runScrollNavigation(
  calendar: CalendarState,
  calendarElement: HTMLElement,
  targetIndex: number,
  animated: boolean,
  refs: CalendarNavigationRefs,
  onComplete?: () => void,
): boolean {
  const scrollElement = calendarElement.querySelector<HTMLElement>("[calchemy-scroll]");
  if (!scrollElement) {
    return false;
  }

  const direction = getScrollDirection(scrollElement);
  if (getScrollSize(scrollElement, direction) <= getClientSize(scrollElement, direction)) {
    return false;
  }

  const anchorIndex =
    refs.periodIndexRef.current ?? calendar.visiblePeriods[0]?.index ?? 0;
  const windowDirection = targetIndex >= anchorIndex ? 1 : -1;

  ensureScrollRunway(calendar, scrollElement, direction, windowDirection);

  const targetPeriod = scrollElement.querySelector<HTMLElement>(
    `[calchemy-period-index='${targetIndex}']`,
  );
  if (!targetPeriod) {
    return false;
  }

  refs.animationCancelRef.current?.();
  refs.syncRef.current.suppressScrollSync = true;
  calendar.setVisiblePeriodIndex(targetIndex);
  refs.periodIndexRef.current = targetIndex;

  const targetPosition = getScrollOffsetToPeriod(scrollElement, targetPeriod, direction);
  const finish = () => {
    refs.animationCancelRef.current = null;
    refs.syncRef.current.suppressScrollSync = false;
    onComplete?.();
  };

  if (!animated) {
    setScrollPosition(scrollElement, direction, targetPosition);
    finish();
    return true;
  }

  refs.animationCancelRef.current = animateScrollPosition(
    scrollElement,
    direction,
    targetPosition,
    { onComplete: finish },
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
