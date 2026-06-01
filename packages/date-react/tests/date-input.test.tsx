import { Temporal } from "@js-temporal/polyfill";
import { cleanup } from "@testing-library/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCalchemyWithTemporal } from "@calchemy/date-core";
import { Calchemy } from "../src";

const calchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    anchor: Temporal.ZonedDateTime.from("2026-05-27T12:00:00-04:00[America/New_York]"),
  },
  completionSources: [{ id: "test", entries: [{ value: "previous 90 days" }] }],
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

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "tomorrow" } });

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-28") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("coerces range starts for single fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="single" onValueChange={onValueChange}>
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
      <Calchemy.Root calchemy={calchemy} expectedValue="range" onValueChange={onValueChange}>
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "last 90 days" } });

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "range", start: Temporal.PlainDate.from("2026-02-27"), end: Temporal.PlainDate.from("2026-05-27") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("commits multiple values for multiple fields", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="multiple" onValueChange={onValueChange}>
        <Calchemy.Field aria-label="Date" />
      </Calchemy.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "next 3 fridays" } });

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

  test("does not render calendar for non-single fields", () => {
    render(
      <Calchemy.Root calchemy={calchemy} expectedValue="range" defaultInputValue="last 90 days">
        <Calchemy.Calendar />
      </Calchemy.Root>,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders candidates for ambiguous input", () => {
    const onValueChange = vi.fn();

    render(
      <Calchemy.Root calchemy={calchemy} defaultInputValue="03/04/25" onValueChange={onValueChange}>
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
