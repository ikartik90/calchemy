import { Temporal } from "@js-temporal/polyfill";
import { cleanup } from "@testing-library/react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createCalchemyWithTemporal } from "@calchemy/date-core";
import type { ExpectedDateValue } from "@calchemy/date-core";
import { CalendarScroll } from "../src/calendar-scroll";
import { PARSE_QUERY_DEBOUNCE_MS } from "../src/hooks/useDebouncedValue";
import { Calchemy } from "../src";

function flushParseQuery() {
  act(() => {
    vi.advanceTimersByTime(PARSE_QUERY_DEBOUNCE_MS);
  });
}

const calchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    referenceDate: Temporal.PlainDate.from("2026-05-27"),
  },
  completionSources: [{ id: "test", entries: [{ value: "previous 90 days" }] }],
});
const namedDateCalchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    referenceDate: Temporal.PlainDate.from("2026-05-27"),
  },
  namedDatesVocabulary: [
    {
      value: "company holiday",
      isHoliday: true,
      resolveDate({ year }) {
        return Temporal.PlainDate.from({ year, month: 5, day: 27 });
      },
    },
    {
      value: "payroll day",
      resolveDate({ year }) {
        return Temporal.PlainDate.from({ year, month: 5, day: 28 });
      },
    },
  ],
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Calchemy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  test("accepts inline completion with Tab", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="prev"
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");

    expect(screen.getByText("ious 90 days")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveProperty("value", "previous 90 days");
  });

  test("renders inline completion backdrop and aria-description", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="prev"
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");
    const field = input.closest("[calchemy-field]");

    expect(field?.querySelector("[calchemy-field-backdrop]")).toBeTruthy();
    expect(field?.getAttribute("calchemy-has-completion")).toBe("");
    expect(input.getAttribute("aria-description")).toBe(
      "Suggestion: previous 90 days. Press Tab to accept.",
    );
  });

  test("omits backdrop and aria-description when there is no completion", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="previous 90 days"
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");
    const field = input.closest("[calchemy-field]");

    expect(field?.querySelector("[calchemy-field-backdrop]")).toBeNull();
    expect(field?.getAttribute("calchemy-has-completion")).toBeNull();
    expect(input.getAttribute("aria-description")).toBeNull();
  });

  test("uses composed casing in aria-description and Tab acceptance", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="Prev"
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");

    expect(input.getAttribute("aria-description")).toBe(
      "Suggestion: Previous 90 days. Press Tab to accept.",
    );
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveProperty("value", "Previous 90 days");
  });

  test("debounces parse and completion queries", () => {
    vi.useFakeTimers();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue=""
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");

    fireEvent.change(input, { target: { value: "p" } });
    expect(screen.queryByText("ious 90 days")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByText("ious 90 days")).toBeNull();

    fireEvent.change(input, { target: { value: "pr" } });
    expect(screen.queryByText("revious 90 days")).toBeNull();
    expect(screen.queryByText("ious 90 days")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByText("evious 90 days")).toBeNull();

    fireEvent.change(input, { target: { value: "prev" } });
    flushParseQuery();
    expect(screen.getByText("ious 90 days")).toBeTruthy();
    expect(input.getAttribute("aria-description")).toBe(
      "Suggestion: previous 90 days. Press Tab to accept.",
    );
  });

  test("keeps aria-description when inline completion rendering is disabled", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="prev"
      >
        <Calchemy.Field aria-label="Date" renderInlineCompletion={false} />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");
    const field = input.closest("[calchemy-field]");

    expect(field?.querySelector("[calchemy-field-backdrop]")).toBeNull();
    expect(input.getAttribute("aria-description")).toBe(
      "Suggestion: previous 90 days. Press Tab to accept.",
    );
  });

  test("emits valid values while typing", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "tomorrow" },
    });
    flushParseQuery();

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-28") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("rejects range values for single fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "last 90 days" } });
    flushParseQuery();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("commits range values for range fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "last 90 days" },
    });
    flushParseQuery();

    expect(onValueChange).toHaveBeenCalledWith(
      {
        kind: "range",
        start: Temporal.PlainDate.from("2026-02-27"),
        end: Temporal.PlainDate.from("2026-05-27"),
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("commits multiple values for multiple fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "next 3 fridays" },
    });
    flushParseQuery();

    expect(onValueChange).toHaveBeenCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-29"),
          Temporal.PlainDate.from("2026-06-05"),
          Temporal.PlainDate.from("2026-06-12"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("coerces single values for multiple fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "tomorrow" },
    });
    flushParseQuery();

    expect(onValueChange).toHaveBeenCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-28")],
      },
      expect.objectContaining({ status: "valid", warnings: [] }),
    );
  });

  test("coerces range values for multiple fields with capped warnings", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        multipleRangeExpansionLimit={3}
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "last 90 days" },
    });
    flushParseQuery();

    expect(onValueChange).toHaveBeenCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-02-27"),
          Temporal.PlainDate.from("2026-02-28"),
          Temporal.PlainDate.from("2026-03-01"),
        ],
      },
      expect.objectContaining({
        status: "valid",
        warnings: [
          {
            code: "maximum-selectable-dates-exceeded",
            message:
              "Exceeded maximum selectable dates. Showing the first 3 dates.",
            limit: 3,
            total: 90,
          },
        ],
      }),
    );
  });

  test("renders range queries in the calendar", () => {
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        defaultInputValue="last 90 days"
      >
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(screen.getByText("February 2026")).toBeTruthy();
    expect(
      container.querySelectorAll("[calchemy-date][calchemy-selected]"),
    ).toHaveLength(2);
  });

  test("renders multiple-date queries in multi-period calendars", () => {
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        defaultInputValue="next 3 fridays"
      >
        <Calchemy.Calendar period={{ months: 2 }}>
          <Calchemy.CalendarPeriodList>
            <Calchemy.CalendarPeriod>
              <Calchemy.CalendarGrid />
            </Calchemy.CalendarPeriod>
          </Calchemy.CalendarPeriodList>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(
      container.querySelectorAll("[calchemy-date][calchemy-selected]"),
    ).toHaveLength(3);
  });

  test("does not select dates from the calendar by default", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(container.querySelector("[calchemy-calendar]")?.getAttribute("calchemy-editable")).toBeNull();
    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test("input mode toggle switches between field and calendar editing", () => {
    const onInputModeChange = vi.fn();
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        onInputModeChange={onInputModeChange}
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
        <Calchemy.InputMode aria-label="Input mode" />
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");
    expect(input).toHaveProperty("readOnly", false);
    expect(container.querySelector("[calchemy-calendar]")?.getAttribute("calchemy-editable")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pick" }));
    expect(onInputModeChange).toHaveBeenLastCalledWith("calendar");
    expect(input).toHaveProperty("readOnly", true);
    expect(container.querySelector("[calchemy-calendar]")?.getAttribute("calchemy-editable")).toBe("");

    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-27") },
      expect.objectContaining({ status: "valid" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    expect(onInputModeChange).toHaveBeenLastCalledWith("field");
    expect(input).toHaveProperty("readOnly", false);
  });

  test("hides candidates while calendar input mode is active", () => {
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        defaultInputValue="03/04/25"
        inputMode="calendar"
      >
        <Calchemy.Candidates />
      </Calchemy.Root>,
    );

    expect(screen.queryByText("March 4, 2025")).toBeNull();
  });

  test("clicking two dates selects an inclusive range in range fields", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="range"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("20"));
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "range",
        start: Temporal.PlainDate.from("2026-05-20"),
        end: Temporal.PlainDate.from("2026-05-20"),
      },
      expect.objectContaining({ status: "valid" }),
    );

    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "range",
        start: Temporal.PlainDate.from("2026-05-20"),
        end: Temporal.PlainDate.from("2026-05-27"),
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("clicking dates toggles multiple calendar selections", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );

    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).toHaveBeenLastCalledWith(
      { kind: "multiple", dates: [] },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("pointer clicking toggles multiple calendar selections through CalendarPeriod", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarPeriod>
            <Calchemy.CalendarGrid />
          </Calchemy.CalendarPeriod>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    clickCalendarDay(container, screen.getByText("27"), { x: 15, y: 15 });
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );

    clickCalendarDay(container, screen.getByText("27"), { x: 15, y: 15 });
    expect(onValueChange).toHaveBeenLastCalledWith(
      { kind: "multiple", dates: [] },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging renders a rectangle between the start point and cursor", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="multiple" inputMode="calendar">
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
    });

    const grid = container.querySelector<HTMLElement>("[calchemy-grid]");
    if (!grid) {
      throw new Error("Expected calendar grid.");
    }

    grid.setPointerCapture = () => {};
    fireEvent.pointerDown(screen.getByText("28"), {
      button: 0,
      clientX: 15,
      clientY: 15,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(grid, {
      clientX: 35,
      clientY: 15,
      isPrimary: true,
      pointerId: 1,
    });
    const dragRect = container.querySelector<HTMLElement>(
      "[calchemy-drag-rect]",
    );
    expect(dragRect).toBeTruthy();
    expect(dragRect?.style.left).toBe("15px");
    expect(dragRect?.style.top).toBe("15px");
    expect(dragRect?.style.width).toBe("20px");
    expect(dragRect?.style.height).toBe("0px");
  });

  test("dragging over unselected dates adds them while keeping existing selections", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultValue={{
          kind: "multiple",
          dates: [Temporal.PlainDate.from("2026-05-27")],
        }}
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
    });
    dragCalendarSelection(
      container,
      screen.getByText("28"),
      { x: 15, y: 15 },
      { x: 35, y: 15 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-27"),
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging over selected dates removes them while keeping dates outside the drag", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultValue={{
          kind: "multiple",
          dates: [
            Temporal.PlainDate.from("2026-05-27"),
            Temporal.PlainDate.from("2026-05-28"),
            Temporal.PlainDate.from("2026-05-29"),
          ],
        }}
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
    });
    dragCalendarSelection(
      container,
      screen.getByText("28"),
      { x: 15, y: 15 },
      { x: 35, y: 15 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging toggles mixed selected and unselected dates once per gesture", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultValue={{
          kind: "multiple",
          dates: [
            Temporal.PlainDate.from("2026-05-27"),
            Temporal.PlainDate.from("2026-05-29"),
          ],
        }}
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
      "30": rect(50, 10, 60, 20),
    });
    dragCalendarSelection(
      container,
      screen.getByText("28"),
      { x: 15, y: 15 },
      { x: 55, y: 15 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-27"),
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-30"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging can start from the gap between scrolled calendar periods", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 1 }}>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const scroll = container.querySelector<HTMLElement>("[calchemy-scroll]");
    const periodList = container.querySelector<HTMLElement>("[calchemy-period-list]");
    if (!scroll || !periodList) {
      throw new Error("Expected calendar scroll container and period list.");
    }

    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
      scrollWidth: { configurable: true, value: 500 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(rect(0, 0, 100, 100));
    vi.spyOn(periodList, "getBoundingClientRect").mockReturnValue(rect(0, 0, 500, 100));
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "28",
      rect(10, 40, 20, 50),
    );
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "29",
      rect(30, 40, 40, 50),
    );

    dragCalendarSelection(
      container,
      periodList,
      { x: 15, y: 45 },
      { x: 35, y: 45 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging can start from the gap between calendar periods without scrolling", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarPeriodList>
            <Calchemy.CalendarPeriod>
              <Calchemy.CalendarGrid />
            </Calchemy.CalendarPeriod>
          </Calchemy.CalendarPeriodList>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const periodList = container.querySelector<HTMLElement>("[calchemy-period-list]");
    if (!periodList) {
      throw new Error("Expected calendar period list.");
    }

    vi.spyOn(periodList, "getBoundingClientRect").mockReturnValue(rect(0, 0, 300, 100));
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "28",
      rect(10, 40, 20, 50),
    );
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "29",
      rect(30, 40, 40, 50),
    );

    dragCalendarSelection(
      container,
      periodList,
      { x: 15, y: 45 },
      { x: 35, y: 45 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging can start from calendar period padding inside a scroll viewport", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 1 }}>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const scroll = container.querySelector<HTMLElement>("[calchemy-scroll]");
    const period = container.querySelector<HTMLElement>("[calchemy-period]");
    if (!scroll || !period) {
      throw new Error("Expected calendar scroll container and period.");
    }

    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
      scrollWidth: { configurable: true, value: 500 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(rect(0, 0, 100, 100));
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "28",
      rect(10, 40, 20, 50),
    );
    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "29",
      rect(30, 40, 40, 50),
    );

    dragCalendarSelection(
      container,
      period,
      { x: 5, y: 5 },
      { x: 35, y: 45 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging can start from the calendar period weekdays row", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarPeriodList>
            <Calchemy.CalendarPeriod>
              <Calchemy.CalendarWeekdays />
              <Calchemy.CalendarGrid />
            </Calchemy.CalendarPeriod>
          </Calchemy.CalendarPeriodList>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 40, 20, 50),
      "29": rect(30, 40, 40, 50),
    });
    const weekdays = container.querySelector<HTMLElement>(
      "[calchemy-days]",
    );
    if (!weekdays) {
      throw new Error("Expected calendar weekdays row.");
    }

    dragCalendarSelection(
      container,
      weekdays,
      { x: 15, y: 5 },
      { x: 35, y: 45 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging selects dates across visible calendar periods", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 2 }}>
          <Calchemy.CalendarPeriodList>
            <Calchemy.CalendarPeriod>
              <Calchemy.CalendarGrid />
            </Calchemy.CalendarPeriod>
          </Calchemy.CalendarPeriodList>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRectInPeriod(
      container,
      "month-2026-05-01",
      "28",
      rect(10, 10, 20, 20),
    );
    mockCalendarDayRectInPeriod(
      container,
      "month-2026-06-01",
      "5",
      rect(10, 100, 20, 110),
    );

    const mayPeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-id='month-2026-05-01']",
    );
    if (!mayPeriod) {
      throw new Error("Expected May calendar period.");
    }

    const startDay = Array.from(
      mayPeriod.querySelectorAll<HTMLButtonElement>("[calchemy-date]"),
    ).find((item) => item.textContent === "28");
    if (!startDay) {
      throw new Error("Expected May 28 calendar day.");
    }

    dragCalendarSelection(
      container,
      startDay,
      { x: 15, y: 15 },
      { x: 15, y: 105 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-06-05"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging ignores dates outside the calendar scroll viewport", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 1 }}>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const scroll = container.querySelector<HTMLElement>("[calchemy-scroll]");
    if (!scroll) {
      throw new Error("Expected calendar scroll container.");
    }

    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
      scrollWidth: { configurable: true, value: 500 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(rect(0, 0, 100, 100));

    for (const period of container.querySelectorAll<HTMLElement>(
      "[calchemy-period]",
    )) {
      const index = Number(period.getAttribute("calchemy-period-index"));
      const left = index * 100;

      Object.defineProperty(period, "getBoundingClientRect", {
        configurable: true,
        value: () => rect(left, 0, left + 100, 100),
      });
    }

    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "15",
      rect(10, 40, 20, 50),
    );
    mockCalendarDayRectInPeriodByIndex(
      container,
      3,
      "20",
      rect(310, 40, 320, 50),
    );

    const visiblePeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-index='0']",
    );
    if (!visiblePeriod) {
      throw new Error("Expected visible calendar period.");
    }

    const startDay = Array.from(
      visiblePeriod.querySelectorAll<HTMLButtonElement>("[calchemy-date]"),
    ).find((item) => item.textContent === "15");
    if (!startDay) {
      throw new Error("Expected visible calendar day 15.");
    }

    dragCalendarSelection(
      container,
      startDay,
      { x: 15, y: 45 },
      { x: 315, y: 45 },
    );

    const periodId = visiblePeriod.getAttribute("calchemy-period-id");
    if (!periodId) {
      throw new Error("Expected visible calendar period id.");
    }

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [plainDateFromPeriodIdAndDay(periodId, 15)],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging ignores clipped dates in partially visible calendar periods", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 1 }}>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const scroll = container.querySelector<HTMLElement>("[calchemy-scroll]");
    if (!scroll) {
      throw new Error("Expected calendar scroll container.");
    }

    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 50 },
      scrollWidth: { configurable: true, value: 1000 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(rect(0, 0, 100, 100));

    for (const period of container.querySelectorAll<HTMLElement>(
      "[calchemy-period]",
    )) {
      const index = Number(period.getAttribute("calchemy-period-index"));
      const left = index * 100 - 50;

      Object.defineProperty(period, "getBoundingClientRect", {
        configurable: true,
        value: () => rect(left, 0, left + 100, 100),
      });
    }

    mockCalendarDayRectInPeriodByIndex(
      container,
      0,
      "15",
      rect(-40, 40, 20, 50),
    );

    const clippedPeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-index='0']",
    );
    if (!clippedPeriod) {
      throw new Error("Expected clipped calendar period.");
    }

    dragCalendarSelection(
      container,
      clippedPeriod,
      { x: -25, y: 45 },
      { x: -15, y: 45 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      { kind: "multiple", dates: [] },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging can start from a blank grid cell", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
    });
    const blankCell = container.querySelector<HTMLElement>(
      "[calchemy-cell][calchemy-blank]",
    );
    if (!blankCell) {
      throw new Error("Expected blank calendar cell.");
    }

    dragCalendarSelection(
      container,
      blankCell,
      { x: 5, y: 15 },
      { x: 35, y: 15 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("dragging ignores disabled dates", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar
          isDateDisabled={(date) =>
            date.equals(Temporal.PlainDate.from("2026-05-29"))
          }
        >
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    mockCalendarDayRects(container, {
      "28": rect(10, 10, 20, 20),
      "29": rect(30, 10, 40, 20),
      "30": rect(50, 10, 60, 20),
    });
    dragCalendarSelection(
      container,
      screen.getByText("28"),
      { x: 15, y: 15 },
      { x: 55, y: 15 },
    );

    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-30"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("controlled selected values drive the calendar even when input parses successfully", () => {
    const onValueChange = vi.fn();
    const { container, rerender } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        inputValue="tomorrow"
        onInputValueChange={() => {}}
        value={{
          kind: "multiple",
          dates: [Temporal.PlainDate.from("2026-05-28")],
        }}
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("29"));
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [
          Temporal.PlainDate.from("2026-05-28"),
          Temporal.PlainDate.from("2026-05-29"),
        ],
      },
      expect.objectContaining({ status: "valid" }),
    );

    rerender(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        inputValue="tomorrow"
        onInputValueChange={() => {}}
        value={{
          kind: "multiple",
          dates: [
            Temporal.PlainDate.from("2026-05-28"),
            Temporal.PlainDate.from("2026-05-29"),
          ],
        }}
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(
      container.querySelectorAll("[calchemy-date][calchemy-selected]"),
    ).toHaveLength(2);
  });

  test("renders a complete calendar with blank bookends by default", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();
    expect(
      container.querySelectorAll("[calchemy-cell][calchemy-blank]"),
    ).toHaveLength(11);
    expect(
      container.querySelector("[calchemy-date][calchemy-outside]"),
    ).toBeNull();
  });

  test("renders previous and next month bookend days when requested", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar>
          <Calchemy.CalendarWeekdays />
          <Calchemy.CalendarGrid showBookends />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(
      container.querySelector("[calchemy-cell][calchemy-blank]"),
    ).toBeNull();
    expect(
      container.querySelectorAll("[calchemy-date][calchemy-outside]"),
    ).toHaveLength(11);
  });

  test("navigates by the calendar period", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 2 }}>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarPrevious />
            <Calchemy.CalendarHeading />
            <Calchemy.CalendarNext />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("July 2026 - August 2026")).toBeTruthy();
  });

  test("query changes update the visible period after manual navigation", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="range">
        <Calchemy.Field aria-label="Date" />
        <Calchemy.Calendar>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarNext />
            <Calchemy.CalendarHeading />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("June 2026")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "last 90 days" },
    });
    flushParseQuery();

    expect(screen.getByText("February 2026")).toBeTruthy();
  });

  test("multiple query changes reveal the first selected date after manual navigation", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="multiple">
        <Calchemy.Field aria-label="Date" />
        <Calchemy.Calendar>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarNext />
            <Calchemy.CalendarHeading />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("June 2026")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "past 3 mondays" },
    });
    flushParseQuery();

    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(
      document.querySelectorAll("[calchemy-date][calchemy-selected]"),
    ).toHaveLength(3);
  });

  test("calendar selection keeps the scrolled period after navigating with next", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultInputValue="tomorrow"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarPrevious />
            <Calchemy.CalendarHeading />
            <Calchemy.CalendarNext />
          </Calchemy.CalendarHeader>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(getCalendarHeadingText()).toBe("May 2026 - July 2026");

    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    expect(getCalendarHeadingText()).toBe("November 2026 - January 2027");

    const novemberPeriod = document.querySelector<HTMLElement>(
      "[calchemy-period-id='month-2026-11-01']",
    );
    if (!novemberPeriod) {
      throw new Error("Expected November 2026 calendar period.");
    }

    fireEvent.click(within(novemberPeriod).getByText("27"));
    expect(getCalendarHeadingText()).toBe("November 2026 - January 2027");
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-28"), Temporal.PlainDate.from("2026-11-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("calendar selection keeps the scrolled period when earlier dates stay selected", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultInputValue="tomorrow"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(container, 2);
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");

    const julyPeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-id='month-2026-07-01']",
    );
    if (!julyPeriod) {
      throw new Error("Expected July 2026 calendar period.");
    }

    fireEvent.click(within(julyPeriod).getByText("27"));
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-05-28"), Temporal.PlainDate.from("2026-07-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("calendar drag selection keeps the scrolled period when earlier dates stay selected", () => {
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        defaultInputValue="tomorrow"
      >
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(container, 2);
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");

    const julyPeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-id='month-2026-07-01']",
    );
    if (!julyPeriod) {
      throw new Error("Expected July 2026 calendar period.");
    }

    const day27 = within(julyPeriod).getByText("27");
    const day28 = within(julyPeriod).getByText("28");
    day27.getBoundingClientRect = () => rect(10, 10, 30, 30);
    day28.getBoundingClientRect = () => rect(40, 10, 60, 30);

    dragCalendarSelection(
      container,
      day27,
      { x: 20, y: 20 },
      { x: 50, y: 20 },
    );

    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");
  });

  test("calendar selection keeps the scrolled period when the date is already visible", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="multiple"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(container, 2);
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");

    const julyPeriod = container.querySelector<HTMLElement>(
      "[calchemy-period-id='month-2026-07-01']",
    );
    if (!julyPeriod) {
      throw new Error("Expected July 2026 calendar period.");
    }

    fireEvent.click(within(julyPeriod).getByText("27"));
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "multiple",
        dates: [Temporal.PlainDate.from("2026-07-27")],
      },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("multiple query changes scroll the first selected date into view", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="multiple">
        <Calchemy.Field aria-label="Date" />
        <Calchemy.Calendar period={{ months: 3 }}>
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
                <Calchemy.CalendarGrid />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(container, 2);
    expect(getCalendarHeadingText()).toBe("July 2026 - September 2026");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "past 3 mondays" },
    });
    flushParseQuery();

    expect(getCalendarHeadingText()).toBe("May 2026 - July 2026");
    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(
      container.querySelectorAll("[calchemy-date][calchemy-selected]"),
    ).toHaveLength(3);
  });

  test("renders a period list for multi-month calendars", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 4 }}>
          <Calchemy.CalendarPeriodList>
            <Calchemy.CalendarPeriod>
              <Calchemy.CalendarPeriodHeading />
            </Calchemy.CalendarPeriod>
          </Calchemy.CalendarPeriodList>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(screen.getByText("June 2026")).toBeTruthy();
    expect(screen.getByText("July 2026")).toBeTruthy();
    expect(screen.getByText("August 2026")).toBeTruthy();
  });

  test("rejects invalid calendar duration objects", () => {
    expect(() =>
      render(
        <Calchemy.Root calchemy={calchemy} expectedValue="single">
          <Calchemy.Calendar period={{ months: 0 }} />
        </Calchemy.Root>,
      ),
    ).toThrow("positive integer duration");
  });

  test("calendar bounds disable dates and previous navigation outside the range", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        inputMode="calendar"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar
          bounds={{
            start: Temporal.PlainDate.from("2026-05-27"),
            end: Temporal.PlainDate.from("2026-06-30"),
          }}
        >
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarPrevious />
            <Calchemy.CalendarNext />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const previous = screen.getByText("Previous");
    const may26 = screen.getByText("26");

    expect(previous).toHaveProperty("disabled", true);
    expect(may26.getAttribute("calchemy-disabled")).toBe("");
    expect(may26.getAttribute("calchemy-out-of-bounds")).toBe("");

    fireEvent.click(may26);
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("27"));
    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-27") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("calendar scroll does not preload past bounds", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar
          period={{ months: 1 }}
          bounds={{
            start: Temporal.PlainDate.from("2026-05-01"),
            end: Temporal.PlainDate.from("2026-06-30"),
          }}
        >
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(container, 1);

    expect(screen.getByText("June 2026")).toBeTruthy();
    expect(screen.queryByText("July 2026")).toBeNull();
  });

  test("calendar disables custom unavailable dates", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        onValueChange={onValueChange}
      >
        <Calchemy.Calendar
          isDateDisabled={(date) =>
            date.equals(Temporal.PlainDate.from("2026-05-27"))
          }
        >
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    const today = screen.getByText("27");
    expect(today).toHaveProperty("disabled", true);

    fireEvent.click(today);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test("calendar exposes configured named dates", () => {
    const { container } = render(
      <Calchemy.Root calchemy={namedDateCalchemy} expectedValue="single">
        <Calchemy.Calendar namedDates="all">
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(namedDateCalchemy.namedDatesVocabulary).toHaveLength(2);
    expect(
      container.querySelector("[calchemy-named-date-labels='company holiday']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[calchemy-named-date-labels='payroll day']"),
    ).toBeTruthy();
  });

  test("calendar can expose only holiday named dates", () => {
    const { container } = render(
      <Calchemy.Root calchemy={namedDateCalchemy} expectedValue="single">
        <Calchemy.Calendar namedDates="holidays">
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(container.querySelector("[calchemy-holiday]")).toBeTruthy();
    expect(
      container.querySelector("[calchemy-named-date-labels='company holiday']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[calchemy-named-date-labels='payroll day']"),
    ).toBeNull();
  });

  test("scroll viewport can extend generated periods", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 1 }}>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );
    const scroll = container.querySelector("[calchemy-scroll]");
    if (!scroll) {
      throw new Error("Expected calendar scroll container.");
    }

    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 100 },
      scrollWidth: { configurable: true, value: 200 },
    });
    fireEvent.scroll(scroll);

    expect(screen.getByText("June 2026")).toBeTruthy();
  });

  test("scroll viewport updates the calendar heading", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );
    const scroll = container.querySelector<HTMLElement>(
      "[calchemy-scroll]",
    );
    const heading = container.querySelector("[calchemy-heading]");
    if (!heading) {
      throw new Error("Expected calendar scroll container and heading.");
    }

    expect(heading.textContent).toBe("May 2026");

    scrollCalendarToPeriodIndex(container, 1);

    expect(heading.textContent).toBe("June 2026");
  });

  test("resets the calendar heading after switching expected value modes", () => {
    function ModeSwitchCalendar() {
      const [expectedValue, setExpectedValue] =
        useState<ExpectedDateValue>("single");

      return (
        <>
          <button type="button" onClick={() => setExpectedValue("single")}>
            Single
          </button>
          <button type="button" onClick={() => setExpectedValue("range")}>
            Range
          </button>
          <button type="button" onClick={() => setExpectedValue("multiple")}>
            Multiple
          </button>
          <Calchemy.Root calchemy={calchemy} expectedValue={expectedValue}>
            <Calchemy.Calendar period={{ months: 3 }}>
              <Calchemy.CalendarHeading />
              <CalendarScroll direction="horizontal">
                <Calchemy.CalendarPeriodList>
                  <Calchemy.CalendarPeriod>
                    <Calchemy.CalendarPeriodHeading />
                  </Calchemy.CalendarPeriod>
                </Calchemy.CalendarPeriodList>
              </CalendarScroll>
            </Calchemy.Calendar>
          </Calchemy.Root>
        </>
      );
    }

    const { container } = render(<ModeSwitchCalendar />);
    const heading = container.querySelector("[calchemy-heading]");
    if (!heading) {
      throw new Error("Expected calendar heading.");
    }

    expect(heading.textContent).toBe("May 2026 - July 2026");

    scrollCalendarToPeriodIndex(container, 1);
    expect(heading.textContent).toBe("June 2026 - August 2026");

    fireEvent.click(screen.getByText("Range"));
    expect(heading.textContent).toBe("May 2026 - July 2026");

    fireEvent.click(screen.getByText("Multiple"));
    expect(heading.textContent).toBe("May 2026 - July 2026");

    fireEvent.click(screen.getByText("Single"));
    expect(heading.textContent).toBe("May 2026 - July 2026");
  });

  test("calendar navigation uses the current scrolled period as its anchor", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarHeading />
            <Calchemy.CalendarNext />
          </Calchemy.CalendarHeader>
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(document.body, 1);
    fireEvent.click(screen.getByText("Next"));

    expect(getCalendarHeadingText()).toBe("July 2026");
  });

  test("calendar selects use the current scrolled period as their anchor", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarMonthSelect aria-label="Month" />
          <Calchemy.CalendarYearSelect
            aria-label="Year"
            startYear={2026}
            endYear={2027}
          />
          <Calchemy.CalendarHeading />
          <CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(document.body, 1);

    expect(screen.getByLabelText("Month")).toHaveProperty("value", "6");

    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2027" },
    });

    expect(getCalendarHeadingText()).toBe("June 2027");
  });

  test("orders weekdays from parse context weekStartsOn", () => {
    const { container } = render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        parseContext={{ weekStartsOn: 1 }}
      >
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(
      container.querySelector("[calchemy-weekday]")?.textContent,
    ).toBe("Mon");
  });

  test("formats weekdays from weekdayFormat", () => {
    const { container: narrowContainer } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar>
          <Calchemy.CalendarWeekdays weekdayFormat="narrow" />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );
    const { container: longContainer } = render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar>
          <Calchemy.CalendarWeekdays weekdayFormat="long" />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(
      narrowContainer.querySelector("[calchemy-weekday]")?.textContent,
    ).toBe("S");
    expect(
      longContainer.querySelector("[calchemy-weekday]")?.textContent,
    ).toBe("Sunday");
  });

  test("month and year selects update the visible period", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar>
          <Calchemy.CalendarMonthSelect aria-label="Month" />
          <Calchemy.CalendarYearSelect
            aria-label="Year"
            startYear={2026}
            endYear={2027}
          />
          <Calchemy.CalendarHeading />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Month"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2027" },
    });

    expect(screen.getByText("July 2027")).toBeTruthy();
  });

  test("year select keeps the visible year available outside a provided display range", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single">
        <Calchemy.Calendar>
          <Calchemy.CalendarYearSelect
            aria-label="Year"
            startYear={2020}
            endYear={2020}
          />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(screen.getByLabelText("Year")).toHaveProperty("value", "2026");
    expect(screen.getByRole("option", { name: "2026" })).toBeTruthy();
  });

  test("renders candidates for ambiguous input", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root
        calchemy={calchemy}
        expectedValue="single"
        defaultInputValue="03/04/25"
        onValueChange={onValueChange}
      >
        <Calchemy.Field aria-label="Date" />
        <Calchemy.Candidates />
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("March 4, 2025"));

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2025-03-04") },
      expect.objectContaining({ status: "valid" }),
    );
  });
});

function scrollCalendarToPeriodIndex(
  container: ParentNode,
  periodIndex: number,
): void {
  const scroll = container.querySelector<HTMLElement>("[calchemy-scroll]");
  if (!scroll) {
    throw new Error("Expected calendar scroll container.");
  }

  Object.defineProperties(scroll, {
    clientWidth: { configurable: true, value: 100 },
    scrollLeft: {
      configurable: true,
      writable: true,
      value: periodIndex * 100,
    },
    scrollWidth: { configurable: true, value: 1000 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 100 }) as DOMRect,
    },
  });

  for (const period of container.querySelectorAll<HTMLElement>(
    "[calchemy-period]",
  )) {
    const index = Number(period.getAttribute("calchemy-period-index"));
    const left = (index - periodIndex) * 100;

    Object.defineProperty(period, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left, right: left + 100, top: 0, bottom: 100 }) as DOMRect,
    });
  }

  fireEvent.scroll(scroll);
}

function getCalendarHeadingText(): string | null | undefined {
  return document.querySelector("[calchemy-heading]")?.textContent;
}

function rect(
  left: number,
  top: number,
  right: number,
  bottom: number,
): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockCalendarDayRects(
  container: ParentNode,
  dayRects: Record<string, DOMRect>,
): void {
  for (const [label, dayRect] of Object.entries(dayRects)) {
    const day = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[calchemy-date]"),
    ).find((item) => item.textContent === label);
    if (!day) {
      throw new Error(`Expected calendar day ${label}.`);
    }

    day.getBoundingClientRect = () => dayRect;
  }
}

function mockCalendarDayRectInPeriod(
  container: ParentNode,
  periodId: string,
  label: string,
  dayRect: DOMRect,
): void {
  const period = container.querySelector<HTMLElement>(
    `[calchemy-period-id='${periodId}']`,
  );
  if (!period) {
    throw new Error(`Expected calendar period ${periodId}.`);
  }

  mockCalendarDayRectInPeriodElement(period, label, dayRect);
}

function mockCalendarDayRectInPeriodByIndex(
  container: ParentNode,
  periodIndex: number,
  label: string,
  dayRect: DOMRect,
): void {
  const period = container.querySelector<HTMLElement>(
    `[calchemy-period-index='${periodIndex}']`,
  );
  if (!period) {
    throw new Error(`Expected calendar period index ${periodIndex}.`);
  }

  mockCalendarDayRectInPeriodElement(period, label, dayRect);
}

function mockCalendarDayRectInPeriodElement(
  period: HTMLElement,
  label: string,
  dayRect: DOMRect,
): void {
  const day = Array.from(
    period.querySelectorAll<HTMLButtonElement>("[calchemy-date]"),
  ).find((item) => item.textContent === label);
  if (!day) {
    throw new Error(`Expected calendar day ${label}.`);
  }

  day.getBoundingClientRect = () => dayRect;
}

function plainDateFromPeriodIdAndDay(periodId: string, day: number) {
  const start = periodId.replace(/^month-/, "");
  const [year, month] = start.split("-").map(Number);
  return Temporal.PlainDate.from({ year, month, day });
}

function getCalendarDragSurface(container: ParentNode): HTMLElement {
  const dragSurface =
    container.querySelector<HTMLElement>(
      "[calchemy-period-list][calchemy-multiple-drag]",
    ) ??
    container.querySelector<HTMLElement>(
      "[calchemy-period][calchemy-multiple-drag]",
    ) ??
    container.querySelector<HTMLElement>(
      "[calchemy-grid][calchemy-multiple-drag]",
    );
  if (!dragSurface) {
    throw new Error("Expected calendar drag surface.");
  }

  return dragSurface;
}

function clickCalendarDay(
  container: ParentNode,
  startElement: HTMLElement,
  point: { x: number; y: number },
): void {
  const dragSurface = getCalendarDragSurface(container);

  dragSurface.setPointerCapture = () => {};
  fireEvent.pointerDown(startElement, {
    button: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
  });
  fireEvent.pointerUp(dragSurface, {
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
  });
}

function dragCalendarSelection(
  container: ParentNode,
  startElement: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  const dragSurface = getCalendarDragSurface(container);

  dragSurface.setPointerCapture = () => {};
  fireEvent.pointerDown(startElement, {
    button: 0,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
  });
  fireEvent.pointerMove(dragSurface, {
    clientX: end.x,
    clientY: end.y,
    isPrimary: true,
    pointerId: 1,
  });
  fireEvent.pointerUp(dragSurface, {
    clientX: end.x,
    clientY: end.y,
    isPrimary: true,
    pointerId: 1,
  });
}
