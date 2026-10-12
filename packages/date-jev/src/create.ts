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
      const { answers } = await options.client.systemOne({
        state: { phrase: input },
        questions: dayQuestions(),
      });
      const tree = treeFromAnswers(answers);
      const value = tree ? resolveDateSlice(tree, resolved.referenceDate, Temporal, resolved, lookups) : null;

      return value ? { status: "valid", input, value } : { status: "invalid", input };
    },
  };
}

function getNativeTemporal(): TemporalApi | undefined {
  return (globalThis as TemporalGlobal).Temporal;
}
