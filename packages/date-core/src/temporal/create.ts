import { parseDateWithTemporal } from "../parser/parse";
import { fromFormValueWithTemporal, fromJSONWithTemporal, toFormValue, toJSON } from "../serialize/values";
import type { Calchemy, CompletionSource, NamedDatesVocabularyEntry, ParseDateContext } from "../types";
import type { TemporalApi, TemporalGlobal } from "./types";

export type CreateCalchemyOptions = {
  defaultContext?: ParseDateContext;
  completionSources?: readonly CompletionSource[];
  namedDatesVocabulary?: readonly NamedDatesVocabularyEntry[];
};

export async function createCalchemy(options: CreateCalchemyOptions = {}): Promise<Calchemy> {
  const Temporal = getNativeTemporal() ?? (await import("@js-temporal/polyfill")).Temporal;

  return createCalchemyWithTemporal(Temporal, options);
}

export function createCalchemyWithTemporal(
  Temporal: TemporalApi,
  options: CreateCalchemyOptions = {},
): Calchemy {
  const parseOptions = options.namedDatesVocabulary ? { namedDatesVocabulary: options.namedDatesVocabulary } : {};

  return {
    Temporal,
    parseDate(input, context = {}) {
      return parseDateWithTemporal(input, { ...options.defaultContext, ...context }, Temporal, parseOptions);
    },
    toJSON,
    fromJSON(value) {
      return fromJSONWithTemporal(value, Temporal);
    },
    toFormValue,
    fromFormValue(value) {
      return fromFormValueWithTemporal(value, Temporal);
    },
    getInlineCompletion(input) {
      return getInlineCompletion(input, options.completionSources ?? []);
    },
  };
}

export function getNativeTemporal(): TemporalApi | undefined {
  return (globalThis as TemporalGlobal).Temporal;
}

function getInlineCompletion(
  input: string,
  completionSources: readonly CompletionSource[],
): Calchemy["getInlineCompletion"] extends (value: string) => infer Result
  ? Result
  : never {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const match = findCompletionMatch(normalized, completionSources);

  if (!match || match.entry.value.toLowerCase() === normalized) {
    return null;
  }

  return {
    value: match.entry.value,
    suffix: match.entry.value.slice(normalized.length),
    sourceId: match.source.id,
  };
}

function findCompletionMatch(
  normalizedInput: string,
  completionSources: readonly CompletionSource[],
): { source: CompletionSource; entry: CompletionSource["entries"][number] } | null {
  for (const source of completionSources) {
    const entry = source.entries.find((candidate) => candidate.value.toLowerCase().startsWith(normalizedInput));
    if (entry) {
      return { source, entry };
    }
  }

  return null;
}
