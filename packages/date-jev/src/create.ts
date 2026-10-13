import { resolveDateSlice } from "./core/parser/resolve";
import { createDateVocabulary, createDateVocabularyLookups } from "./core/parser/vocabulary";
import type { TemporalApi, TemporalGlobal } from "./core/temporal/types";
import { resolveContext } from "./context";
import { labelDateValue } from "./core/parser/primitives/shared";
import type { DateValue } from "./core/types";
import { dateQuestions, rangeQuestions, readAnswers, type Reading } from "./read";
import { splitRange } from "./split";
import type { Candidate, CreateJevParserOptions, JevParser } from "./types";

// Example: `await createJevParser({ client })` loads Temporal and returns a parser that asks Jev through `client`.
export async function createJevParser(options: CreateJevParserOptions): Promise<JevParser> {
  const Temporal = getNativeTemporal() ?? (await import("@js-temporal/polyfill")).Temporal;
  const lookups = createDateVocabularyLookups(createDateVocabulary());

  return {
    async parseDate(input, context = {}) {
      if (!input.trim()) {
        return { status: "invalid", input, errors: [{ code: "empty-input", message: "Enter a date phrase." }] };
      }

      const resolved = resolveContext(context, Temporal);
      // One call asks about the whole phrase and, when it splits at a connector, about each end too.
      const split = splitRange(input);
      const { answers, model } = await options.client.systemOne({
        state: split ? { phrase: input, ...split } : { phrase: input },
        questions: split ? { ...dateQuestions("phrase", input), ...rangeQuestions(split) } : dateQuestions("phrase", input),
      });
      // Keep the readings that name real dates: `feb 30` has no day reading, only February 2030.
      const found = readAnswers(answers, input, split !== null).flatMap((reading) => {
        const value = resolveDateSlice(reading.slice, resolved.referenceDate, Temporal, resolved, lookups);
        return value ? [{ reading, value }] : [];
      });

      const [only] = found;
      if (!only) {
        return {
          status: "invalid",
          input,
          errors: [{ code: "unsupported-expression", message: `Calchemy could not read "${input}" as a date.` }],
          model,
        };
      }

      if (found.length === 1) {
        return { status: "valid", input, value: only.value, confidence: only.reading.confidence, model };
      }

      const candidates = candidatesFrom(found);
      return { status: "ambiguous", input, candidates, confidence: sum(candidates), model };
    },
  };
}

// Example: `june 27` returns June 27 and June 2027. Together they are as sure as Jev's reading of the
// phrase, and each takes the share Jev's answers give it, so their confidences sum to the result's.
function candidatesFrom(found: ReadonlyArray<{ reading: Reading; value: DateValue }>): Candidate[] {
  const weights = found.map(({ reading }) => reading.alternative?.weight ?? 0);
  const total = weights.reduce((left, right) => left + right, 0);
  return found.map(({ reading, value }, index) => ({
    id: reading.alternative?.id ?? `reading-${index + 1}`,
    value,
    confidence: reading.confidence * (total > 0 ? (weights[index] ?? 0) / total : 1 / found.length),
    label: labelDateValue(value),
  }));
}

function sum(candidates: readonly Candidate[]): number {
  return candidates.reduce((total, candidate) => total + candidate.confidence, 0);
}

function getNativeTemporal(): TemporalApi | undefined {
  return (globalThis as TemporalGlobal).Temporal;
}
