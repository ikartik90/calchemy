import type { CalendarScrollDirection, CalendarState } from "./types";

export function getScrollPosition(element: HTMLElement, direction: CalendarScrollDirection): number {
  return direction === "horizontal" ? element.scrollLeft : element.scrollTop;
}

export function setScrollPosition(
  element: HTMLElement,
  direction: CalendarScrollDirection,
  value: number,
): void {
  if (direction === "horizontal") {
    element.scrollLeft = value;
    return;
  }

  element.scrollTop = value;
}

export function getScrollSize(element: HTMLElement, direction: CalendarScrollDirection): number {
  return direction === "horizontal" ? element.scrollWidth : element.scrollHeight;
}

export function getClientSize(element: HTMLElement, direction: CalendarScrollDirection): number {
  return direction === "horizontal" ? element.clientWidth : element.clientHeight;
}

export function getScrollOffsetToPeriod(
  scrollElement: HTMLElement,
  period: HTMLElement,
  direction: CalendarScrollDirection,
): number {
  const scrollRect = scrollElement.getBoundingClientRect();
  const periodRect = period.getBoundingClientRect();

  return (
    getScrollPosition(scrollElement, direction) +
    (direction === "horizontal"
      ? periodRect.left - scrollRect.left
      : periodRect.top - scrollRect.top)
  );
}

export function scrollPeriodIntoView(
  scrollElement: HTMLElement,
  period: HTMLElement,
  direction: CalendarScrollDirection,
  options?: { instant?: boolean },
): void {
  const targetPosition = getScrollOffsetToPeriod(scrollElement, period, direction);

  if (!options?.instant) {
    setScrollPosition(scrollElement, direction, targetPosition);
    return;
  }

  const previousBehavior = scrollElement.style.scrollBehavior;
  scrollElement.style.scrollBehavior = "auto";
  setScrollPosition(scrollElement, direction, targetPosition);
  scrollElement.style.scrollBehavior = previousBehavior;
}

const smoothScrollFallbackMs = 1000;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function animateScrollPosition(
  element: HTMLElement,
  direction: CalendarScrollDirection,
  targetPosition: number,
  options?: { onComplete?: () => void },
): () => void {
  const currentPosition = getScrollPosition(element, direction);
  if (Math.abs(currentPosition - targetPosition) < 1) {
    options?.onComplete?.();
    return () => {};
  }

  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  let settled = false;

  const finish = () => {
    if (settled) {
      return;
    }

    settled = true;
    element.removeEventListener("scrollend", onScrollEnd);
    window.clearTimeout(fallbackTimeoutId);
    options?.onComplete?.();
  };

  const onScrollEnd = () => {
    finish();
  };

  element.addEventListener("scrollend", onScrollEnd);
  const fallbackTimeoutId = window.setTimeout(
    finish,
    behavior === "smooth" ? smoothScrollFallbackMs : 0,
  );

  if (typeof element.scrollTo !== "function") {
    setScrollPosition(element, direction, targetPosition);
    finish();
  } else if (direction === "horizontal") {
    element.scrollTo({ left: targetPosition, behavior });
  } else {
    element.scrollTo({ top: targetPosition, behavior });
  }

  if (behavior === "auto" && typeof element.scrollTo === "function") {
    finish();
  }

  return () => {
    settled = true;
    element.removeEventListener("scrollend", onScrollEnd);
    window.clearTimeout(fallbackTimeoutId);
  };
}

export function getScrollAnchorPeriod(
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
): HTMLElement | null {
  const scrollRect = scrollElement.getBoundingClientRect();
  const periods = Array.from(scrollElement.querySelectorAll<HTMLElement>("[calchemy-period]"));
  let fallback: HTMLElement | null = null;
  const edgeTolerancePx = 1;

  for (const period of periods) {
    const periodRect = period.getBoundingClientRect();
    const periodStart = direction === "horizontal" ? periodRect.left : periodRect.top;
    const periodEnd = direction === "horizontal" ? periodRect.right : periodRect.bottom;
    const scrollStart = direction === "horizontal" ? scrollRect.left : scrollRect.top;
    const scrollEnd = direction === "horizontal" ? scrollRect.right : scrollRect.bottom;

    if (periodEnd <= scrollStart) {
      continue;
    }
    if (periodStart >= scrollEnd) {
      break;
    }

    fallback = period;
    if (periodStart >= scrollStart - edgeTolerancePx) {
      return period;
    }
  }

  return fallback;
}

export function getCalendarPeriodWindowSize(
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
  periodCount: number,
): number {
  const periods = Array.from(scrollElement.querySelectorAll<HTMLElement>("[calchemy-period]"));
  const firstPeriod = periods[0];
  const nextPeriod = periods[1];
  const fallback = direction === "horizontal" ? scrollElement.clientWidth : scrollElement.clientHeight;

  if (!firstPeriod) {
    return fallback;
  }

  const firstRect = firstPeriod.getBoundingClientRect();
  const nextRect = nextPeriod?.getBoundingClientRect();
  const singlePeriodSize = nextRect
    ? direction === "horizontal"
      ? nextRect.left - firstRect.left
      : nextRect.top - firstRect.top
    : direction === "horizontal"
      ? firstRect.width
      : firstRect.height;
  const windowSize = Math.abs(singlePeriodSize) * periodCount;

  return windowSize > 0 ? windowSize : fallback;
}

export function getLoadedPeriodRunway(
  calendar: CalendarState,
  anchor: HTMLElement | null,
  direction: "before" | "after",
): number | null {
  const anchorIndex = anchor?.getAttribute("calchemy-period-index")
    ? Number(anchor.getAttribute("calchemy-period-index"))
    : NaN;
  const firstIndex = calendar.periods[0]?.index;
  const lastIndex = calendar.periods.at(-1)?.index;

  if (!Number.isFinite(anchorIndex) || firstIndex === undefined || lastIndex === undefined) {
    return null;
  }

  return direction === "before" ? anchorIndex - firstIndex : lastIndex - anchorIndex;
}
