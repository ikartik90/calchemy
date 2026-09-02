import { describe, expect, test } from "vitest";
import { standardizeChunks } from "../src/parser/chunks";
import { normalizeInput } from "../src/parser/normalize";
import { sliceDateExpression } from "../src/parser/slice";
import { getDateVocabularyLookups } from "../src/parser/vocabulary";
import { isCompositionalBoundary } from "../src/parser/expression/from-slice";
import type { DateExpression } from "../src/parser/expression/types";
import type { BoundarySlice } from "../src/parser/slice/types";

const lookups = getDateVocabularyLookups();

function sliceOf(phrase: string): DateExpression {
  const normalized = normalizeInput(phrase, lookups);
  const chunks = standardizeChunks(normalized.tokens, lookups);
  return sliceDateExpression(normalized.normalized, chunks, lookups).expression;
}

// Widened to BoundarySlice on purpose: the type system already says a scope
// holds a leaf, so this keeps the assertion a runtime check on the grammar.
function scopeBoundaries(expression: DateExpression): BoundarySlice[] {
  switch (expression.kind) {
    case "scope":
      return [expression.boundary];
    case "select":
    case "iterate":
    case "sample":
      return scopeBoundaries(expression.inner);
  }
}

describe("lowering compositional phrases into the expression tree", () => {
  test.each([
    "first week of next month",
    "third sunday of next month",
    "second weekend of next month",
    "sunday of next week",
    "between 50th and 52nd week this year",
    "first 10 days of next month",
    "last 2 weeks of next quarter",
    "first week of each month",
    "last weekday of every month",
    "all mondays in first week of next month",
    "15th of next month",
    "first half of 2027",
    "last weekday of next month",
    "start of last 2 weeks of next quarter",
  ])("scope nodes never carry a compositional boundary: %s", (phrase) => {
    const leaked = scopeBoundaries(sliceOf(phrase)).filter(isCompositionalBoundary);

    expect(leaked).toEqual([]);
  });

  test("an ordinal unit inside a plain range lowers to a select over a scope", () => {
    expect(sliceOf("first week of next month")).toEqual({
      kind: "select",
      select: { kind: "ordinal-units", ordinals: [1], unit: "week" },
      inner: {
        kind: "scope",
        boundary: {
          kind: "relative",
          expression: {
            kind: "modifier",
            modifier: "next",
            target: { kind: "calendar-unit", unit: "month" },
          },
        },
      },
    });
  });

  test("an ordinal weekday inside a plain range lowers to a select over a scope", () => {
    expect(sliceOf("third sunday of next month")).toEqual({
      kind: "select",
      select: { kind: "ordinal-weekday", ordinal: 3, weekday: 7 },
      inner: {
        kind: "scope",
        boundary: {
          kind: "relative",
          expression: {
            kind: "modifier",
            modifier: "next",
            target: { kind: "calendar-unit", unit: "month" },
          },
        },
      },
    });
  });

  test("an ordinal unit over each-unit lowers to select over iterate over scope", () => {
    expect(sliceOf("first week of each month")).toEqual({
      kind: "select",
      select: { kind: "ordinal-units", ordinals: [1], unit: "week" },
      inner: {
        kind: "iterate",
        iterate: { kind: "each-unit", unit: "month" },
        inner: {
          kind: "scope",
          boundary: {
            kind: "relative",
            expression: {
              kind: "modifier",
              modifier: "this",
              target: { kind: "calendar-unit", unit: "year" },
            },
          },
        },
      },
    });
  });
});
