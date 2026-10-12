import { resolveDateSlice } from "./core/parser/resolve";
import { createDateVocabulary, createDateVocabularyLookups } from "./core/parser/vocabulary";
import type { TemporalApi, TemporalGlobal } from "./core/temporal/types";
import { resolveContext } from "./context";
import { dayQuestions, treeFromAnswers } from "./read";
import type { CreateJevParserOptions, JevParser } from "./types";

// Example: `await createJevParser({ client })` loads Temporal and returns a parser that asks Jev through `client`.
export async function createJevParser(options: CreateJevParserOptions): Promise<JevParser> {
  const Temporal = getNativeTemporal() ?? (await import("@js-temporal/polyfill")).Temporal;
  const lookups = createDateVocabularyLookups(createDateVocabulary());

  return {
    async parseDate(input, context = {}) {
      const resolved = resolveContext(context, Temporal);
      const { answers, model } = await options.client.systemOne({
        state: { phrase: input },
        questions: dayQuestions(),
      });
      const reading = treeFromAnswers(answers);
      const value = reading ? resolveDateSlice(reading.slice, resolved.referenceDate, Temporal, resolved, lookups) : null;

      return reading && value
        ? { status: "valid", input, value, confidence: reading.confidence, model }
        : { status: "invalid", input, model };
    },
  };
}

function getNativeTemporal(): TemporalApi | undefined {
  return (globalThis as TemporalGlobal).Temporal;
}
