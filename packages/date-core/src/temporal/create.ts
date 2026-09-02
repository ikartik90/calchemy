import { parseDateWithTemporal } from "../parser/parse";
import { fromFormValueWithTemporal, fromJSONWithTemporal, toFormValue, toJSON } from "../serialize/values";
import type { Calchemy, CompletionSource, InlineCompletion, NamedDatesVocabularyEntry, ParseDateContext } from "../types";
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
    namedDatesVocabulary: options.namedDatesVocabulary ?? [],
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
    getInlineCompletion(input, context = {}) {
      return getInlineCompletion(input, options.completionSources ?? [], { ...options.defaultContext, ...context }, Temporal, parseOptions);
    },
  };
}

export function getNativeTemporal(): TemporalApi | undefined {
  return (globalThis as TemporalGlobal).Temporal;
}

function getInlineCompletion(
  input: string,
  completionSources: readonly CompletionSource[],
  context: ParseDateContext,
  Temporal: TemporalApi,
  parseOptions: Parameters<typeof parseDateWithTemporal>[3],
): InlineCompletion | null {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const match = findCompletionMatch(normalized, completionSources);

  if (match && match.entry.value.toLowerCase() !== normalized) {
    return {
      value: match.entry.value,
      suffix: inlineCompletionSuffix(input, match.entry.value),
      sourceId: match.source.id,
    };
  }

  return getNextCalendarCycleCompletion(input, context, Temporal, parseOptions);
}

function inlineCompletionSuffix(input: string, completionValue: string): string {
  if (completionValue.toLowerCase().startsWith(input.toLowerCase())) {
    return completionValue.slice(input.length);
  }

  return completionValue.slice(input.trim().toLowerCase().length);
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

function getNextCalendarCycleCompletion(
  input: string,
  context: ParseDateContext,
  Temporal: TemporalApi,
  parseOptions: Parameters<typeof parseDateWithTemporal>[3],
): InlineCompletion | null {
  const trimmed = input.trimEnd();
  if (!hasFloatingCalendarRangeEnd(trimmed)) {
    return null;
  }

  const currentResult = parseDateWithTemporal(trimmed, context, Temporal, parseOptions);
  if (currentResult.status !== "invalid") {
    return null;
  }

  const referenceYear = context.referenceDate?.year ?? Temporal.Now.plainDateISO(context.timeZone).year;
  for (let year = referenceYear; year <= referenceYear + 10; year += 1) {
    const value = `${trimmed} ${year}`;
    const result = parseDateWithTemporal(value, context, Temporal, parseOptions);
    if (result.status === "valid") {
      return {
        value,
        suffix: value.slice(input.length),
        sourceId: "calendar-cycle",
      };
    }
  }

  return null;
}

const FloatingCalendarRangeEndPattern = (() => {
  const month = String.raw`jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?`;
  const quarter = String.raw`q[1-4]|(?:first|second|third|fourth) quarter`;
  const boundary = String.raw`(?:(?:start|beginning|end) of )?(?:${month}|${quarter})`;
  return new RegExp(String.raw`\b(?:until|till|up to|upto|to)\s+(?:the\s+)?${boundary}$`, "i");
})();

function hasFloatingCalendarRangeEnd(input: string): boolean {
  return FloatingCalendarRangeEndPattern.test(input.trim());
}
