import { Temporal } from "@js-temporal/polyfill";
import { cleanup } from "@testing-library/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCalchemyWithTemporal } from "@calchemy/date-core";
import { DateInput } from "../src";

const calchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    anchor: Temporal.ZonedDateTime.from("2026-05-27T12:00:00-04:00[America/New_York]"),
  },
  completionSources: [{ id: "test", entries: [{ value: "previous 90 days" }] }],
});

afterEach(() => {
  cleanup();
});

describe("DateInput", () => {
  test("accepts inline completion with Tab", () => {
    render(
      <DateInput.Root calchemy={calchemy} defaultInputValue="prev">
        <DateInput.Field aria-label="Date" />
      </DateInput.Root>,
    );

    const input = screen.getByLabelText("Date");

    expect(screen.getByText("ious 90 days")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveProperty("value", "previous 90 days");
  });

  test("emits valid values while typing", () => {
    const onValueChange = vi.fn();

    render(
      <DateInput.Root calchemy={calchemy} onValueChange={onValueChange}>
        <DateInput.Field aria-label="Date" />
      </DateInput.Root>,
    );

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "tomorrow" } });

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2026-05-28") },
      expect.objectContaining({ status: "valid" }),
    );
  });

  test("renders candidates for ambiguous input", () => {
    const onValueChange = vi.fn();

    render(
      <DateInput.Root calchemy={calchemy} defaultInputValue="03/04/25" onValueChange={onValueChange}>
        <DateInput.Field aria-label="Date" />
        <DateInput.Candidates />
      </DateInput.Root>,
    );

    fireEvent.click(screen.getByText("March 4, 2025"));

    expect(onValueChange).toHaveBeenCalledWith(
      { kind: "single", date: Temporal.PlainDate.from("2025-03-04") },
      expect.objectContaining({ status: "valid" }),
    );
  });
});
