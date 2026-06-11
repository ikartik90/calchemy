import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { standardizeChunks } from "../src/parser/chunks";
import { findUnsupportedExpressionToken } from "../src/parser/diagnostics";
import { normalizeInput } from "../src/parser/normalize";
import { sliceDateExpression } from "../src/parser/slice";
import { createDateVocabulary, createDateVocabularyLookups } from "../src/parser/vocabulary";

const vocabulary = createDateVocabulary();
const lookups = createDateVocabularyLookups(vocabulary);
const anchorDate = Temporal.PlainDate.from("2026-05-27");
const context = {
  referenceDate: anchorDate,
  locale: "en-US",
  weekStartsOn: 0 as const,
  dateOrderPreference: ["MDY", "DMY", "YMD"] as const,
  lastNDaysIncludesToday: true,
};

describe("findUnsupportedExpressionToken", () => {
  test("prefers unknown word chunks over unresolved atoms", () => {
    const input = "next qzxwv";
    const normalized = normalizeInput(input, lookups);
    const chunks = standardizeChunks(normalized.tokens, lookups);
    const slice = sliceDateExpression(normalized.normalized, chunks, lookups);

    expect(chunks.map((chunk) => chunk.kind)).toEqual(["word", "word"]);

    const token = findUnsupportedExpressionToken(
      chunks,
      slice,
      input,
      anchorDate,
      Temporal,
      context,
      lookups,
    );

    expect(token).toEqual({
      kind: "word",
      raw: "qzxwv",
      normalized: "qzxwv",
      start: 5,
      end: 10,
    });
  });
});
