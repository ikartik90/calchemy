import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type PointerEvent,
  type RefObject,
} from "react";
import type { DateValue, PlainDate } from "@calchemy/date-core";
import { useCalchemyCalendar } from "./context";

type Point = {
  x: number;
  y: number;
};

type CellBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type DragState = {
  pointerId: number;
  start: Point;
  current: Point;
  baseDates: PlainDate[];
  previewKeys: string[];
  hasMoved: boolean;
  startDayCell: DayCell | null;
  cellBounds: ReadonlyMap<string, CellBounds>;
};

type DayCell = {
  date: PlainDate;
  disabled: boolean;
  element: HTMLButtonElement;
};

type DragRectangle = {
  start: Point;
  current: Point;
};

export type CalendarPeriodDragContextValue = {
  multipleSelection: boolean;
  dragState: DragState | null;
  dragRectangle: DragRectangle | null;
  previewSelectedKeys: ReadonlySet<string>;
  suppressClickRef: RefObject<boolean>;
  surfaceRef: RefObject<HTMLElement | null>;
  registerDay(element: HTMLButtonElement | null, date: PlainDate, disabled: boolean): void;
  handlePointerDownCapture(event: PointerEvent<HTMLElement>): void;
  handlePointerMove(event: PointerEvent<HTMLElement>): void;
  handlePointerUp(event: PointerEvent<HTMLElement>): void;
  handlePointerCancel(event: PointerEvent<HTMLElement>): void;
};

const CalendarPeriodDragContext = createContext<CalendarPeriodDragContextValue | null>(null);

export const multipleDragSurfaceStyle = {
  position: "relative",
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
} as const;

export const multiplePeriodListDragSurfaceStyle = {
  ...multipleDragSurfaceStyle,
  position: "relative",
  background: "transparent",
} as const;

export type CalendarDragPointerHandlerProps = Pick<
  ComponentPropsWithoutRef<"div">,
  "onPointerDownCapture" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onDragStart"
>;

// Example: `mergeCalendarDragPointerProps(true, drag, handlers)` chains drag surface handlers with caller props.
export function mergeCalendarDragPointerProps(
  enabled: boolean,
  drag: CalendarPeriodDragContextValue | null | undefined,
  handlers: CalendarDragPointerHandlerProps,
): CalendarDragPointerHandlerProps {
  if (!enabled || !drag) {
    return handlers;
  }

  const { onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel, onDragStart } = handlers;

  return {
    onPointerDownCapture: (event) => {
      drag.handlePointerDownCapture(event);
      onPointerDownCapture?.(event);
    },
    onPointerMove: (event) => {
      drag.handlePointerMove(event);
      onPointerMove?.(event);
    },
    onPointerUp: (event) => {
      drag.handlePointerUp(event);
      onPointerUp?.(event);
    },
    onPointerCancel: (event) => {
      drag.handlePointerCancel(event);
      onPointerCancel?.(event);
    },
    onDragStart: (event) => {
      event.preventDefault();
      onDragStart?.(event);
    },
  };
}

export function useOptionalCalendarPeriodDrag(): CalendarPeriodDragContextValue | null {
  return useContext(CalendarPeriodDragContext);
}

export function useCalendarPeriodDragSurface(
  dragSelection = true,
  surfaceElementRef?: RefObject<HTMLElement | null>,
): CalendarPeriodDragContextValue | null {
  const calendar = useCalchemyCalendar();
  const multipleSelection = dragSelection && calendar.calchemy.expectedValue === "multiple";
  const surfaceRef = useRef<HTMLElement | null>(null);
  const dayCells = useRef(new Map<string, DayCell>());
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragGestureCleanupRef = useRef<(() => void) | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragRectangle, setDragRectangle] = useState<DragRectangle | null>(null);
  const previewSelectedKeys = useMemo(
    () => new Set(dragState?.previewKeys ?? []),
    [dragState],
  );

  const acquireDragGestureLock = useCallback(() => {
    if (dragGestureCleanupRef.current || typeof document === "undefined") {
      return;
    }

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
    };

    const clearDocumentSelection = () => {
      document.getSelection()?.removeAllRanges();
    };

    const previousBodyUserSelect = document.body.style.userSelect;
    const previousDocumentUserSelect = document.documentElement.style.userSelect;
    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";

    document.addEventListener("pointermove", preventGestureDefault, { capture: true, passive: false });
    document.addEventListener("touchmove", preventGestureDefault, { capture: true, passive: false });
    document.addEventListener("wheel", preventGestureDefault, { capture: true, passive: false });
    document.addEventListener("selectstart", preventGestureDefault, { capture: true });
    document.addEventListener("dragstart", preventGestureDefault, { capture: true });
    clearDocumentSelection();

    dragGestureCleanupRef.current = () => {
      document.removeEventListener("pointermove", preventGestureDefault, { capture: true });
      document.removeEventListener("touchmove", preventGestureDefault, { capture: true });
      document.removeEventListener("wheel", preventGestureDefault, { capture: true });
      document.removeEventListener("selectstart", preventGestureDefault, { capture: true });
      document.removeEventListener("dragstart", preventGestureDefault, { capture: true });
      document.body.style.userSelect = previousBodyUserSelect;
      document.documentElement.style.userSelect = previousDocumentUserSelect;
      clearDocumentSelection();
      dragGestureCleanupRef.current = null;
    };
  }, []);

  const releaseDragGestureLock = useCallback(() => {
    dragGestureCleanupRef.current?.();
    if (dragPreviewFrameRef.current !== null) {
      cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }
  }, []);

  const scheduleDragPreviewUpdate = useCallback((nextDragState: DragState) => {
    dragStateRef.current = nextDragState;
    if (dragPreviewFrameRef.current !== null) {
      return;
    }

    dragPreviewFrameRef.current = requestAnimationFrame(() => {
      setDragState(dragStateRef.current);
      dragPreviewFrameRef.current = null;
    });
  }, []);

  const registerDay = useCallback((element: HTMLButtonElement | null, date: PlainDate, disabled: boolean) => {
    const key = date.toString();
    if (element) {
      dayCells.current.set(key, { date, disabled, element });
      return;
    }

    dayCells.current.delete(key);
  }, []);

  const getDayCellFromTarget = useCallback((target: EventTarget | null): DayCell | null => {
    if (!(target instanceof Element)) {
      return null;
    }

    const button = target.closest("[calchemy-date]");
    if (!(button instanceof HTMLButtonElement)) {
      return null;
    }

    for (const cell of dayCells.current.values()) {
      if (cell.element === button) {
        return cell;
      }
    }

    return null;
  }, []);

  const commitMultipleSelection = useCallback(
    (keys: Iterable<string>, fallbackDates: readonly PlainDate[] = []) => {
      const dates = resolveDateKeys(keys, dayCells.current, fallbackDates);
      calendar.selectValue({
        kind: "multiple",
        dates,
      });
    },
    [calendar],
  );

  const endDragGesture = useCallback(
    (pointerId?: number) => {
      if (pointerId !== undefined) {
        surfaceRef.current?.releasePointerCapture?.(pointerId);
      }

      releaseDragGestureLock();
      dragStateRef.current = null;
      setDragState(null);
      setDragRectangle(null);
    },
    [releaseDragGestureLock],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const activeDrag = dragStateRef.current;
      if (!multipleSelection || !activeDrag || event.pointerId !== activeDrag.pointerId) {
        return;
      }

      event.preventDefault();
      const current = getPointerPoint(event);
      setDragRectangle({ start: activeDrag.start, current });
      const dragRect = getDragRect(activeDrag.start, current);
      const clipRect = getDragClipRect(surfaceRef.current);
      const gestureKeys = getIntersectingDateKeys(
        dayCells.current,
        dragRect,
        activeDrag.cellBounds,
        clipRect,
      );
      const baseKeys = activeDrag.baseDates.map((date) => date.toString());
      const previewKeys = toggleDateKeys(baseKeys, gestureKeys);
      const hasMoved = activeDrag.hasMoved || hasPointerMoved(activeDrag.start, current);
      scheduleDragPreviewUpdate({
        ...activeDrag,
        current,
        previewKeys,
        hasMoved,
      });
    },
    [multipleSelection, scheduleDragPreviewUpdate],
  );

  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!multipleSelection || event.button !== 0 || !event.isPrimary) {
        return;
      }

      const baseDates = getMultipleDates(calendar.selected);
      event.preventDefault();

      if (typeof document !== "undefined") {
        document.getSelection()?.removeAllRanges();
      }

      surfaceRef.current = surfaceElementRef?.current ?? event.currentTarget;
      surfaceRef.current?.setPointerCapture?.(event.pointerId);
      acquireDragGestureLock();
      const nextDragState: DragState = {
        pointerId: event.pointerId,
        start: getPointerPoint(event),
        current: getPointerPoint(event),
        baseDates,
        previewKeys: baseDates.map((selectedDate) => selectedDate.toString()),
        hasMoved: false,
        startDayCell: getDayCellFromTarget(event.target),
        cellBounds: snapshotCellBounds(dayCells.current),
      };
      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
      setDragRectangle({
        start: nextDragState.start,
        current: nextDragState.current,
      });
    },
    [acquireDragGestureLock, calendar.selected, getDayCellFromTarget, multipleSelection, surfaceElementRef],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const activeDrag = dragStateRef.current;
      if (!multipleSelection || !activeDrag || event.pointerId !== activeDrag.pointerId) {
        return;
      }

      if (dragPreviewFrameRef.current !== null) {
        cancelAnimationFrame(dragPreviewFrameRef.current);
        dragPreviewFrameRef.current = null;
        setDragState(activeDrag);
      }

      event.preventDefault();

      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      if (activeDrag.hasMoved) {
        commitMultipleSelection(activeDrag.previewKeys, activeDrag.baseDates);
      } else {
        const dayCell = activeDrag.startDayCell;
        if (dayCell && !dayCell.disabled) {
          const selectedDates = getMultipleDates(calendar.selected);
          const nextKeys = toggleDateKeys(
            selectedDates.map((selectedDate) => selectedDate.toString()),
            [dayCell.date.toString()],
          );
          commitMultipleSelection(nextKeys, selectedDates.concat(dayCell.date));
        }
      }

      endDragGesture(event.pointerId);

      const focused = document.activeElement;
      if (focused instanceof HTMLElement && event.currentTarget.contains(focused)) {
        focused.blur();
      }
    },
    [calendar.selected, commitMultipleSelection, endDragGesture, getDayCellFromTarget, multipleSelection],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const activeDrag = dragStateRef.current;
      if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
        return;
      }

      endDragGesture(event.pointerId);
    },
    [endDragGesture],
  );

  return useMemo(() => {
    if (!multipleSelection) {
      return null;
    }

    return {
      multipleSelection,
      dragState,
      dragRectangle,
      previewSelectedKeys,
      suppressClickRef,
      surfaceRef,
      registerDay,
      handlePointerDownCapture,
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
    };
  }, [
    dragRectangle,
    dragState,
    handlePointerCancel,
    handlePointerDownCapture,
    handlePointerMove,
    handlePointerUp,
    multipleSelection,
    previewSelectedKeys,
    registerDay,
  ]);
}

export type CalendarDragRectangleOverlayProps = {
  dragRectangle?: DragRectangle | null;
  surfaceRef?: RefObject<HTMLElement | null>;
};

export function CalendarDragRectangleOverlay({
  dragRectangle: dragRectangleProp,
  surfaceRef: surfaceRefProp,
}: CalendarDragRectangleOverlayProps = {}) {
  const drag = useOptionalCalendarPeriodDrag();
  const dragRectangle = dragRectangleProp ?? drag?.dragRectangle ?? null;
  const surfaceRef = surfaceRefProp ?? drag?.surfaceRef;

  if (!dragRectangle) {
    return null;
  }

  const surface = surfaceRef?.current;
  if (!surface) {
    return null;
  }

  const surfaceRect = surface.getBoundingClientRect();
  const left = Math.min(dragRectangle.start.x, dragRectangle.current.x) - surfaceRect.left;
  const top = Math.min(dragRectangle.start.y, dragRectangle.current.y) - surfaceRect.top;
  const width = Math.abs(dragRectangle.current.x - dragRectangle.start.x);
  const height = Math.abs(dragRectangle.current.y - dragRectangle.start.y);

  return (
    <div
      aria-hidden="true"
      calchemy-drag-rect=""
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

export type CalendarPeriodDragProviderProps = {
  value: CalendarPeriodDragContextValue;
  children: React.ReactNode;
};

export function CalendarPeriodDragProvider({ value, children }: CalendarPeriodDragProviderProps) {
  return (
    <CalendarPeriodDragContext.Provider value={value}>{children}</CalendarPeriodDragContext.Provider>
  );
}

export function getMultipleDates(value: DateValue | null): PlainDate[] {
  return value?.kind === "multiple" ? value.dates : [];
}

export function getSelectedDateKeys(value: DateValue | null): string[] {
  return getMultipleDates(value).map((date) => date.toString());
}

export function toggleDateKeys(baseKeys: readonly string[], toggledKeys: readonly string[]): string[] {
  const next = new Set(baseKeys);
  for (const key of toggledKeys) {
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
  }

  return Array.from(next).sort();
}

function getPointerPoint(event: Pick<PointerEvent, "clientX" | "clientY">): Point {
  return { x: event.clientX, y: event.clientY };
}

function hasPointerMoved(start: Point, current: Point): boolean {
  return Math.abs(start.x - current.x) > 2 || Math.abs(start.y - current.y) > 2;
}

function getDragRect(start: Point, current: Point): DOMRect {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);

  return {
    left,
    right,
    top,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function snapshotCellBounds(cells: ReadonlyMap<string, DayCell>): Map<string, CellBounds> {
  const bounds = new Map<string, CellBounds>();
  for (const [key, cell] of cells) {
    const rect = cell.element.getBoundingClientRect();
    bounds.set(key, {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
  }

  return bounds;
}

function getDragClipRect(surface: HTMLElement | null): CellBounds | null {
  if (!surface) {
    return null;
  }

  const scrollContainer = surface.closest("[calchemy-scroll]");
  if (!(scrollContainer instanceof HTMLElement)) {
    return null;
  }

  const rect = scrollContainer.getBoundingClientRect();

  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
}

function clipBoundsToRect(
  bounds: Pick<CellBounds, "left" | "right" | "top" | "bottom">,
  clip: CellBounds,
): CellBounds | null {
  const left = Math.max(bounds.left, clip.left);
  const right = Math.min(bounds.right, clip.right);
  const top = Math.max(bounds.top, clip.top);
  const bottom = Math.min(bounds.bottom, clip.bottom);

  if (left > right || top > bottom) {
    return null;
  }

  return { left, right, top, bottom };
}

function getIntersectingDateKeys(
  cells: ReadonlyMap<string, DayCell>,
  dragRect: DOMRect,
  cellBounds: ReadonlyMap<string, CellBounds>,
  clipRect: CellBounds | null = null,
): string[] {
  const clippedDragRect = clipRect ? clipBoundsToRect(dragRect, clipRect) : dragRect;
  if (!clippedDragRect) {
    return [];
  }

  return Array.from(cells.entries())
    .filter(([key, cell]) => {
      const bounds = cellBounds.get(key);
      if (!bounds || cell.disabled) {
        return false;
      }

      const visibleBounds = clipRect ? clipBoundsToRect(bounds, clipRect) : bounds;
      return visibleBounds && rectsIntersect(clippedDragRect, visibleBounds);
    })
    .map(([key]) => key);
}

function rectsIntersect(
  left: Pick<CellBounds, "left" | "right" | "top" | "bottom">,
  right: CellBounds,
): boolean {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top;
}

function resolveDateKeys(
  keys: Iterable<string>,
  cells: ReadonlyMap<string, DayCell>,
  fallbackDates: readonly PlainDate[],
): PlainDate[] {
  const fallbackByKey = new Map(fallbackDates.map((date) => [date.toString(), date]));
  return Array.from(keys)
    .sort()
    .flatMap((key) => {
      const date = cells.get(key)?.date ?? fallbackByKey.get(key);
      return date ? [date] : [];
    });
}
