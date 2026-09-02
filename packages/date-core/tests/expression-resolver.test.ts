import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { resolveExpression } from "../src/parser/resolve/expression";
import { createDateVocabulary, createDateVocabularyLookups } from "../src/parser/vocabulary";
import type { DateExpression } from "../src/parser/expression/types";
import type { DateValueJSON } from "../src";

const vocabulary = createDateVocabulary();
const lookups = createDateVocabularyLookups(vocabulary);
const anchorDate = Temporal.PlainDate.from("2026-06-26");
const context = {
  referenceDate: anchorDate,
  locale: "en-US",
  weekStartsOn: 0 as const,
  dateOrderPreference: ["MDY", "DMY", "YMD"] as const,
  lastNDaysIncludesToday: true,
};

function toJSON(value: NonNullable<ReturnType<typeof resolveExpression>>): DateValueJSON {
  if (value.kind === "single") {
    return { kind: "single", date: value.date.toString() };
  }

  if (value.kind === "range") {
    return { kind: "range", start: value.start.toString(), end: value.end.toString() };
  }

  return { kind: "multiple", dates: value.dates.map((date) => date.toString()) };
}

describe("resolveExpression", () => {
  test("selects the last four weeks inside a quarter scope", () => {
    const expression: DateExpression = {
      kind: "select",
      select: { kind: "edge-count-unit", edge: "last", count: 4, unit: "week" },
      inner: {
        kind: "scope",
        boundary: {
          kind: "relative",
          expression: {
            kind: "modifier",
            modifier: "next",
            target: { kind: "calendar-unit", unit: "quarter" },
          },
        },
      },
    };

    expect(toJSON(resolveExpression(expression, anchorDate, Temporal, context, lookups)!)).toEqual({
      kind: "range",
      start: "2026-09-06",
      end: "2026-09-30",
    });
  });

  test("selects an ordinal week in each month of an explicit month-range scope", () => {
    const expression: DateExpression = {
      kind: "select",
      select: { kind: "ordinal-units", ordinals: [1], unit: "week" },
      inner: {
        kind: "iterate",
        iterate: { kind: "each-unit", unit: "month" },
        inner: {
          kind: "scope",
          boundary: {
            kind: "year-range",
            year: 2026,
          },
        },
      },
    };

    const value = resolveExpression(expression, anchorDate, Temporal, context, lookups);
    expect(value?.kind).toBe("multiple");
    if (value?.kind === "multiple") {
      expect(value.dates.length).toBeGreaterThan(10);
      expect(value.dates[0]?.toString()).toBe("2026-07-01");
    }
  });
});

describe("composition nested inside a leaf boundary", () => {
  // `start of last 2 weeks of next quarter` parses as a boundary-side leaf whose
  // child is compositional. The boundary resolver must hand that child to the
  // expression resolver rather than evaluate it — this guards that hand-off.
  test("routes a compositional child through the expression resolver", () => {
    const expression: DateExpression = {
      kind: "scope",
      boundary: {
        kind: "boundary-side",
        side: "start",
        boundary: {
          kind: "edge-count-unit-in-range",
          edge: "last",
          count: 2,
          unit: "week",
          skipHolidays: false,
          range: {
            kind: "relative",
            expression: {
              kind: "modifier",
              modifier: "next",
              target: { kind: "calendar-unit", unit: "quarter" },
            },
          },
        },
      },
    };

    // Independent check: the first test in this file pins the last four weeks
    // of the same quarter as starting 2026-09-06, so the last two start 09-20.
    expect(toJSON(resolveExpression(expression, anchorDate, Temporal, context, lookups)!)).toEqual({
      kind: "single",
      date: "2026-09-20",
    });
  });
});
