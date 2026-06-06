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

export function getScrollAnchorPeriod(
  scrollElement: HTMLElement,
  direction: CalendarScrollDirection,
): HTMLElement | null {
  const scrollRect = scrollElement.getBoundingClientRect();
  const periods = Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-calchemy-period]"));
  let fallback: HTMLElement | null = null;

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
    if (periodStart >= scrollStart) {
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
  const periods = Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-calchemy-period]"));
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
  const anchorIndex = anchor?.dataset.periodIndex ? Number(anchor.dataset.periodIndex) : NaN;
  const firstIndex = calendar.periods[0]?.index;
  const lastIndex = calendar.periods.at(-1)?.index;

  if (!Number.isFinite(anchorIndex) || firstIndex === undefined || lastIndex === undefined) {
    return null;
  }

  return direction === "before" ? anchorIndex - firstIndex : lastIndex - anchorIndex;
}
