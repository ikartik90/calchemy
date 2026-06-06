import { Temporal } from "@js-temporal/polyfill";
import { cleanup } from "@testing-library/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCalchemyWithTemporal } from "@calchemy/date-core";
import { Calchemy } from "../src";

const calchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    anchor: Temporal.ZonedDateTime.from(
      "2026-05-27T12:00:00-04:00[America/New_York]",
    ),
  },
  completionSources: [{ id: "test", entries: [{ value: "previous 90 days" }] }],
});
const namedDateCalchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    anchor: Temporal.ZonedDateTime.from(
      "2026-05-27T12:00:00-04:00[America/New_York]",
    ),
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
  cleanup();
});

describe("Calchemy", () => {
  test("accepts inline completion with Tab", () => {
    render(
      <Calchemy.Root calchemy={calchemy} defaultInputValue="prev">
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    const input = screen.getByLabelText("Date");

    expect(screen.getByText("ious 90 days")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveProperty("value", "previous 90 days");
  });

  test("emits valid values while typing", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root calchemy={calchemy} onValueChange={onValueChange}>
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "tomorrow" },
    });

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-28") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("coerces range starts for single fields", () => {
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

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-02-27") },
      expect.objectContaining({ status: "valid" }),
    );
    expect(input.getAttribute("aria-invalid")).toBe("false");
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
      container.querySelectorAll("[data-calchemy-day][data-selected]"),
    ).toHaveLength(2);
  });

  test("renders multiple-date queries in multi-period calendars", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy} defaultInputValue="next 3 fridays">
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
      container.querySelectorAll("[data-calchemy-day][data-selected]"),
    ).toHaveLength(3);
  });

  test("renders a complete calendar with blank bookends by default", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();
    expect(
      container.querySelectorAll("[data-calchemy-cell][data-blank]"),
    ).toHaveLength(11);
    expect(
      container.querySelector("[data-calchemy-day][data-outside]"),
    ).toBeNull();
  });

  test("renders previous and next month bookend days when requested", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar>
          <Calchemy.CalendarWeekdays />
          <Calchemy.CalendarGrid showBookends />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(
      container.querySelector("[data-calchemy-cell][data-blank]"),
    ).toBeNull();
    expect(
      container.querySelectorAll("[data-calchemy-day][data-outside]"),
    ).toHaveLength(11);
  });

  test("navigates by whole month increments", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarPrevious pageSize={{ months: 2 }} />
            <Calchemy.CalendarHeading />
            <Calchemy.CalendarNext pageSize={{ months: 2 }} />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("July 2026")).toBeTruthy();
  });

  test("query changes update the visible period after manual navigation", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
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

    expect(screen.getByText("February 2026")).toBeTruthy();
  });

  test("renders a period list for multi-month calendars", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
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
        <Calchemy.Root calchemy={calchemy}>
          <Calchemy.Calendar period={{ months: 0 }} />
        </Calchemy.Root>,
      ),
    ).toThrow("positive integer duration");
  });

  test("calendar bounds disable dates and previous navigation outside the range", () => {
    const onValueChange = vi.fn();
    render(
      <Calchemy.Root calchemy={calchemy} onValueChange={onValueChange}>
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
    expect(may26.getAttribute("data-disabled")).toBe("");
    expect(may26.getAttribute("data-out-of-bounds")).toBe("");

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
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar
          period={{ months: 1 }}
          bounds={{
            start: Temporal.PlainDate.from("2026-05-01"),
            end: Temporal.PlainDate.from("2026-06-30"),
          }}
        >
          <Calchemy.CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </Calchemy.CalendarScroll>
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
      <Calchemy.Root calchemy={calchemy} onValueChange={onValueChange}>
        <Calchemy.Calendar
          isDateDisabled={(date) => date.equals(Temporal.PlainDate.from("2026-05-27"))}
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
      <Calchemy.Root calchemy={namedDateCalchemy}>
        <Calchemy.Calendar namedDates="all">
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(namedDateCalchemy.namedDatesVocabulary).toHaveLength(2);
    expect(container.querySelector("[data-named-date-labels='company holiday']")).toBeTruthy();
    expect(container.querySelector("[data-named-date-labels='payroll day']")).toBeTruthy();
  });

  test("calendar can expose only holiday named dates", () => {
    const { container } = render(
      <Calchemy.Root calchemy={namedDateCalchemy}>
        <Calchemy.Calendar namedDates="holidays">
          <Calchemy.CalendarGrid />
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    expect(container.querySelector("[data-holiday]")).toBeTruthy();
    expect(container.querySelector("[data-named-date-labels='company holiday']")).toBeTruthy();
    expect(container.querySelector("[data-named-date-labels='payroll day']")).toBeNull();
  });

  test("scroll viewport can extend generated periods", () => {
    const { container } = render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </Calchemy.CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );
    const scroll = container.querySelector("[data-calchemy-scroll]");
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
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarHeading />
          <Calchemy.CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </Calchemy.CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );
    const scroll = container.querySelector<HTMLElement>(
      "[data-calchemy-scroll]",
    );
    const heading = container.querySelector("[data-calchemy-heading]");
    if (!heading) {
      throw new Error("Expected calendar scroll container and heading.");
    }

    expect(heading.textContent).toBe("May 2026");

    scrollCalendarToPeriodIndex(container, 1);

    expect(heading.textContent).toBe("June 2026");
  });

  test("calendar navigation uses the current scrolled period as its anchor", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarHeader>
            <Calchemy.CalendarHeading />
            <Calchemy.CalendarNext pageSize={{ months: 1 }} />
          </Calchemy.CalendarHeader>
          <Calchemy.CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </Calchemy.CalendarScroll>
        </Calchemy.Calendar>
      </Calchemy.Root>,
    );

    scrollCalendarToPeriodIndex(document.body, 1);
    fireEvent.click(screen.getByText("Next"));

    expect(getCalendarHeadingText()).toBe("July 2026");
  });

  test("calendar selects use the current scrolled period as their anchor", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
        <Calchemy.Calendar period={{ months: 1 }}>
          <Calchemy.CalendarMonthSelect aria-label="Month" />
          <Calchemy.CalendarYearSelect
            aria-label="Year"
            startYear={2026}
            endYear={2027}
          />
          <Calchemy.CalendarHeading />
          <Calchemy.CalendarScroll direction="horizontal">
            <Calchemy.CalendarPeriodList>
              <Calchemy.CalendarPeriod>
                <Calchemy.CalendarPeriodHeading />
              </Calchemy.CalendarPeriod>
            </Calchemy.CalendarPeriodList>
          </Calchemy.CalendarScroll>
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
      <Calchemy.Root calchemy={calchemy} parseContext={{ weekStartsOn: 1 }}>
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(
      container.querySelector("[data-calchemy-weekday]")?.textContent,
    ).toBe("Mon");
  });

  test("month and year selects update the visible period", () => {
    render(
      <Calchemy.Root calchemy={calchemy}>
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
      <Calchemy.Root calchemy={calchemy}>
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

function scrollCalendarToPeriodIndex(container: ParentNode, periodIndex: number): void {
  const scroll = container.querySelector<HTMLElement>("[data-calchemy-scroll]");
  if (!scroll) {
    throw new Error("Expected calendar scroll container.");
  }

  Object.defineProperties(scroll, {
    clientWidth: { configurable: true, value: 100 },
    scrollLeft: { configurable: true, writable: true, value: periodIndex * 100 },
    scrollWidth: { configurable: true, value: 1000 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 100 }) as DOMRect,
    },
  });

  for (const period of container.querySelectorAll<HTMLElement>(
    "[data-calchemy-period]",
  )) {
    const index = Number(period.dataset.periodIndex);
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
  return document.querySelector("[data-calchemy-heading]")?.textContent;
}
