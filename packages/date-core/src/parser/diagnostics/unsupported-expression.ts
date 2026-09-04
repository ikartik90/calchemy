import { weeksInIsoYear } from "../primitives/date-math";
import { comparePlainDate } from "../primitives/shared";
import { resolveRangeEndpoints, resolveYearReference } from "../resolve/boundary";
import {
  findFirstUnresolvedAtomToken,
  findFirstUnsupportedWordToken,
  findNearestKnownWord,
} from "./unsupported-token";
import type { StandardChunk } from "../chunks";
import type { DateExpression, DateSlice } from "../expression/types";
import type { BoundarySlice } from "../slice/types";
import { RelativeModifierSet, type RelativeModifier } from "../types";
import type { PlainDate, TemporalApi } from "../../temporal/types";
import type { ParseDateError, ResolvedParseDateContext, Token } from "../../types";
import type { DateVocabularyLookups } from "../vocabulary";

export type UnsupportedExpressionDiagnosis = {
  chunks: readonly StandardChunk[];
  slice: DateSlice;
  /** The phrase as the user typed it. Messages and suggestions quote it. */
  input: string;
  anchorDate: PlainDate;
  Temporal: TemporalApi;
  context: ResolvedParseDateContext;
  lookups: DateVocabularyLookups;
  /** Whether a rewritten phrase would parse, without producing diagnostics of its own. */
  parses(candidate: string): boolean;
};

type Diagnoser = (args: UnsupportedExpressionDiagnosis) => ParseDateError | null;

/**
 * Explains a phrase the parser could not turn into dates.
 *
 * Each check below looks for one specific cause and says what to type
 * instead. The order matters: an unknown word is reported before anything
 * that assumes the words are known, and the concrete checks run before the
 * generic "known words, unknown arrangement" fallback.
 *
 * Example: `diagnoseUnsupportedExpression(argsFor("tomorrow until march"))`
 * reports a range that ends before it starts and suggests `tomorrow until march 2027`.
 */
export function diagnoseUnsupportedExpression(args: UnsupportedExpressionDiagnosis): ParseDateError {
  const diagnosers: Diagnoser[] = [
    diagnoseNoDateWords,
    diagnoseTimeOfDay,
    diagnoseUnknownWord,
    diagnoseLoneModifier,
    diagnoseLeadingConnector,
    diagnoseExclusionOnly,
    diagnoseCommandOnly,
    diagnoseSpacedNumericDate,
    diagnoseRepeatedWord,
    diagnoseZeroStep,
    diagnoseDayOfMonthOutOfRange,
    diagnoseUnitNumberOutOfCalendar,
    diagnoseDanglingConnector,
    diagnoseBareNumber,
    diagnoseUnitWithoutCount,
    diagnoseOrdinalWeekdayWithoutPeriod,
    diagnoseTrailingSingularWeekday,
    diagnoseOrdinalOfNamedSet,
    diagnoseInvertedRange,
    diagnoseNeedsPeriod,
    diagnoseUnresolvedAtom,
  ];

  for (const diagnose of diagnosers) {
    const error = diagnose(args);
    if (error) {
      return error;
    }
  }

  return {
    code: "unsupported-expression",
    message: "Calchemy knows these words but cannot read them in this order yet. Try a simpler wording.",
  };
}

// Example: `the` → nothing left once filler is removed, so point at a few phrases that work.
function diagnoseNoDateWords({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  if (chunks.length > 0) {
    return null;
  }

  return unsupported(`Calchemy did not find a date in "${input.trim()}". Try "tomorrow", "next week", or "aug 15".`);
}

// Example: `next friday at 5pm` → `Calchemy reads dates only, not times. Drop "at 5pm".`
function diagnoseTimeOfDay({ chunks, input, lookups }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const token = findFirstUnsupportedWordToken(chunks, input, lookups);
  if (!token) {
    return null;
  }

  // `5 pm`: the unknown word is `pm`, but the time starts at the number before it.
  const index = chunks.findIndex((chunk) => chunk.token.start === token.start);
  const previous = chunks[index - 1];
  const from = previous && isDigitChunk(previous) && /^(?:am|pm)$/i.test(token.raw) ? previous.token.start : token.start;
  const rest = input.slice(from).replace(/\s+$/, "").replace(/[.,]$/, "");
  const looksLikeTime = /^(?:at\b.*|\d{1,2}(?::\d{2})?\s?(?:am|pm)\b.*|noon\b.*|midnight\b.*)$/i.test(rest);
  if (!looksLikeTime) {
    return null;
  }

  return unsupported(`Calchemy reads dates only, not times. Drop "${rest}".`, token);
}

// Example: `next` → `"next" needs a period after it, for example "next week".`
function diagnoseLoneModifier({ chunks }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const only = chunks[0];
  if (chunks.length !== 1 || only?.kind !== "word" || !RelativeModifierSet.has(only.value as RelativeModifier)) {
    return null;
  }

  return unsupported(
    `"${only.token.raw}" needs a period after it, for example "${only.token.raw} week".`,
    only.token,
  );
}

const LeadingConnectorGuidance: Record<string, (phrase: string) => string> = {
  from: (phrase) => `"${phrase}" needs an end, for example "${phrase} until aug 15".`,
  of: () => `"of" needs something to pick before it, for example "15th of next month".`,
  to: (phrase) => `"${phrase}" needs a start before it, for example "tomorrow ${phrase}".`,
  until: (phrase) => `"${phrase}" needs a start before it, for example "tomorrow ${phrase}".`,
  through: (phrase) => `"${phrase}" needs a start before it, for example "tomorrow ${phrase}".`,
  and: (phrase) => `"${phrase}" needs a first date before it, for example "today ${phrase}".`,
  or: (phrase) => `"${phrase}" needs a first date before it, for example "today ${phrase}".`,
};

// Example: `from tomorrow` → needs an end; `of next month` → needs something to pick before it.
function diagnoseLeadingConnector({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  if (first?.kind !== "connector" || chunks.length < 2 || last?.kind === "connector") {
    return null;
  }

  const guidance = LeadingConnectorGuidance[first.value];
  if (!guidance) {
    return null;
  }

  const hasEnd = chunks.some(
    (chunk) => chunk.kind === "connector" && (chunk.value === "until" || chunk.value === "to" || chunk.value === "through"),
  );
  if (first.value === "from" && hasEnd) {
    return null;
  }

  return unsupported(guidance(input.trim()), first.token);
}

// Example: `next qzxwv` → `Calchemy does not understand "qzxwv".`; `nxt week` adds `Did you mean "next"?`.
function diagnoseUnknownWord({ chunks, input, lookups }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const token = findFirstUnsupportedWordToken(chunks, input, lookups);
  if (!token) {
    return null;
  }

  const nearest = token.normalized.includes(" ") ? null : findNearestKnownWord(token.normalized, lookups);
  const hint = nearest ? ` Did you mean "${nearest}"?` : "";
  return unsupported(`Calchemy does not understand "${token.raw}".${hint}`, token);
}

// Example: `excluding holidays` → needs a range to exclude from.
function diagnoseExclusionOnly({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  if (chunks[0]?.kind !== "exclusion-marker") {
    return null;
  }

  return unsupported(
    `"${input.trim()}" needs a range to exclude from, for example "next month excluding holidays".`,
  );
}

// Example: `all` → needs a day pattern and a period; `every other` likewise.
function diagnoseCommandOnly({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const onlyCommands =
    chunks.length > 0 &&
    chunks.every(
      (chunk, index) =>
        chunk.kind === "command" ||
        (chunk.kind === "word" && chunk.value === "other" && chunks[index - 1]?.kind === "command"),
    );
  if (!onlyCommands) {
    return null;
  }

  const phrase = input.trim();
  const example = /^every\b/i.test(phrase) ? `${phrase} monday in june` : `${phrase} mondays in june`;
  return unsupported(`"${phrase}" needs a day pattern and a period, for example "${example}".`);
}

// Example: `2020 03 15` → try `2020-03-15`.
function diagnoseSpacedNumericDate({ chunks, input, parses }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const allDigits = chunks.length === 3 && chunks.every((chunk) => isDigitChunk(chunk));
  if (!allDigits) {
    return null;
  }

  const phrase = input.trim();
  const candidate = chunks.map((chunk) => chunk.token.raw).join("-");
  if (parses(candidate)) {
    return {
      ...unsupported(`Calchemy does not read "${phrase}" with spaces between the parts. Try "${candidate}".`),
      suggestedInput: candidate,
    };
  }

  return unsupported(
    `Calchemy does not read "${phrase}" with spaces between the parts. Put dashes or slashes between them.`,
  );
}

// Example: `next next week` → `"next" is repeated. Use it once, for example "next week".`
function diagnoseRepeatedWord({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  for (let index = 1; index < chunks.length; index += 1) {
    const previous = chunks[index - 1]!;
    const current = chunks[index]!;
    const repeatable = current.kind === "word" || current.kind === "relative";
    if (!repeatable || current.kind !== previous.kind || current.token.normalized !== previous.token.normalized) {
      continue;
    }

    if (isDigitChunk(current)) {
      continue;
    }

    const example = `${input.slice(0, previous.token.start)}${input.slice(current.token.start)}`.replace(/\s+/g, " ").trim();
    return unsupported(`"${current.token.raw}" is repeated. Use it once, for example "${example}".`, current.token);
  }

  return null;
}

// Example: `every 0 days` → use a step of 1 or more.
function diagnoseZeroStep({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  for (let index = 0; index < chunks.length - 1; index += 1) {
    const command = chunks[index]!;
    const step = chunks[index + 1]!;
    if (command.kind !== "command" || command.value !== "every" || step.token.normalized !== "0") {
      continue;
    }

    const unit = chunks[index + 2];
    const end = unit?.kind === "duration-unit" ? unit.token.end : step.token.end;
    const phrase = input.slice(command.token.start, end);
    const example = `${input.slice(command.token.start, step.token.start)}2${input.slice(step.token.end, end)}`;
    return unsupported(`"${phrase}" never lands on a date. Use a step of 1 or more, for example "${example}".`, step.token);
  }

  return null;
}

// Example: `the 32nd` → `There is no 32nd day in any month. Days run from 1st to 31st.`
function diagnoseDayOfMonthOutOfRange({ chunks }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const ordinal = chunks.find(
    (chunk) => chunk.kind === "ordinal" && /^\d+(?:st|nd|rd|th)$/.test(chunk.token.raw) && chunk.value > 31,
  );
  if (!ordinal) {
    return null;
  }

  return unsupported(`There is no ${ordinal.token.raw} day in any month. Days run from 1st to 31st.`, ordinal.token);
}

/**
 * A month, quarter, or week number past the calendar rolls forward when no
 * year is written, so only a phrase that names the year can be outside it.
 *
 * Example: `m13 2026` → `There is no month 13 in 2026. Months run from m1 to m12.`
 */
function diagnoseUnitNumberOutOfCalendar({ slice, anchorDate, Temporal }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  for (const boundary of collectLeafBoundaries(slice.expression)) {
    if (
      boundary.kind !== "month-range" &&
      boundary.kind !== "quarter-range" &&
      boundary.kind !== "week-range" &&
      boundary.kind !== "shorthand-range-list"
    ) {
      continue;
    }

    if (boundary.year.kind === "anchor") {
      continue;
    }

    const year = resolveYearReference(boundary.year, anchorDate.year);
    const numbers =
      boundary.kind === "month-range"
        ? [boundary.month]
        : boundary.kind === "quarter-range"
          ? [boundary.quarter]
          : boundary.kind === "week-range"
            ? [boundary.week]
            : boundary.ordinals;
    const unit = boundary.kind === "shorthand-range-list" ? boundary.unit : boundary.kind.replace("-range", "");

    if (unit === "month") {
      const month = numbers.find((number) => number > 12);
      if (month !== undefined) {
        return unsupported(`There is no month ${month} in ${year}. Months run from m1 to m12.`);
      }
    }

    if (unit === "quarter") {
      const quarter = numbers.find((number) => number > 4);
      if (quarter !== undefined) {
        return unsupported(`There is no quarter ${quarter} in ${year}. Quarters run from q1 to q4.`);
      }
    }

    if (unit === "week") {
      const weeks = weeksInIsoYear(year, Temporal);
      const week = numbers.find((number) => number > weeks);
      if (week !== undefined) {
        return unsupported(`${year} has ${weeks} weeks, so there is no week ${week}.`);
      }
    }
  }

  return null;
}

// Example: `collectLeafBoundaries(sampledRange)` returns the range and both of its endpoint boundaries.
function collectLeafBoundaries(expression: DateExpression): BoundarySlice[] {
  if (expression.kind !== "scope") {
    return collectLeafBoundaries(expression.inner);
  }

  const { boundary } = expression;
  if (boundary.kind === "range") {
    return [boundary, boundary.start.boundary, boundary.end.boundary];
  }

  return [boundary];
}

const ConnectorGuidance: Record<string, { needs: string; example: string }> = {
  until: { needs: "a date", example: "tomorrow until aug 15" },
  through: { needs: "a date", example: "aug 15 through sep 30" },
  to: { needs: "a date", example: "aug 15 to sep 30" },
  from: { needs: "a date", example: "3 weeks from today" },
  between: { needs: "two dates", example: "between aug 15 and sep 30" },
  and: { needs: "a second date", example: "today and tomorrow" },
  or: { needs: "a second date", example: "today or tomorrow" },
  in: { needs: "a period", example: "mondays in june" },
  during: { needs: "a period", example: "mondays during june" },
  for: { needs: "a period", example: "mondays for the next 2 weeks" },
  of: { needs: "a period", example: "15th of next month" },
  before: { needs: "a date", example: "the thursday before next weekend" },
  preceding: { needs: "a date", example: "the thursday preceding next weekend" },
  after: { needs: "a date", example: "the monday after next weekend" },
  following: { needs: "a date", example: "the monday following next weekend" },
  plus: { needs: "an amount", example: "next monday plus 2 weeks" },
  minus: { needs: "an amount", example: "next monday minus 2 weeks" },
};

// Example: `monday to` → `"to" needs a date after it, for example "aug 15 to sep 30".`
function diagnoseDanglingConnector({ chunks }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const last = chunks[chunks.length - 1];
  if (last?.kind !== "connector" || last.value === ",") {
    return null;
  }

  const guidance = ConnectorGuidance[last.value];
  if (!guidance) {
    return null;
  }

  const hasBetween = chunks.some((chunk) => chunk.kind === "connector" && chunk.value === "between");
  const example = last.value === "and" && hasBetween ? "between aug 15 and sep 30" : guidance.example;
  if (chunks.length === 1) {
    return unsupported(
      `"${last.token.raw}" on its own is not a date phrase. It joins two parts, for example "${example}".`,
      last.token,
    );
  }

  return unsupported(`"${last.token.raw}" needs ${guidance.needs} after it, for example "${example}".`, last.token);
}

// Example: `in 3` → `"3" needs a unit such as days, weeks, or months, for example "in 3 days".`
function diagnoseBareNumber({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const numbers = chunks.filter((chunk) => isDigitChunk(chunk));
  const number = numbers[0];
  if (numbers.length !== 1 || !number || number.token.raw.length === 4) {
    return null;
  }

  const hasUnitLikeChunk = chunks.some(
    (chunk) =>
      chunk.kind === "duration-unit" ||
      chunk.kind === "month" ||
      chunk.kind === "weekday" ||
      chunk.kind === "period" ||
      chunk.kind === "shorthand" ||
      (chunk.kind === "word" && ["q", "w", "m"].includes(chunk.value)),
  );
  if (hasUnitLikeChunk) {
    return null;
  }

  const example = `${input.slice(0, number.token.end)} days${input.slice(number.token.end)}`.trim();
  return unsupported(
    `"${number.token.raw}" needs a unit such as days, weeks, or months, for example "${example}".`,
    number.token,
  );
}

// Example: `weeks from now` → `"weeks" needs a number in front of it, for example "2 weeks from now".`
function diagnoseUnitWithoutCount({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const first = chunks[0];
  const second = chunks[1];
  if (first?.kind !== "duration-unit" || !first.token.raw.endsWith("s") || second?.kind !== "connector") {
    return null;
  }

  const example = `2 ${input.trim()}`;
  return unsupported(`"${first.token.raw}" needs a number in front of it, for example "${example}".`, first.token);
}

// Example: `3rd friday` → needs a period to count within.
function diagnoseOrdinalWeekdayWithoutPeriod({ chunks, input }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const [ordinal, weekday] = chunks;
  if (chunks.length !== 2 || ordinal?.kind !== "ordinal" || weekday?.kind !== "weekday") {
    return null;
  }

  const phrase = input.trim();
  return unsupported(`"${phrase}" needs a period to count within, for example "${phrase} of next month".`);
}

// Example: `next month monday` → use `next month mondays`, or `first monday of next month`.
function diagnoseTrailingSingularWeekday({ chunks, input, lookups, parses }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const last = chunks[chunks.length - 1];
  if (chunks.length < 2 || last?.kind !== "weekday") {
    return null;
  }

  const typed = last.token.raw.toLowerCase();
  const canonical = lookups.aliases.get(typed) ?? typed;
  if (typed === `${canonical}s`) {
    return null;
  }

  const period = input.slice(0, last.token.start).trim();
  if (!period || !parses(period)) {
    return null;
  }

  return unsupported(
    `"${last.token.raw}" on its own after "${period}" is not read. ` +
      `Use "${period} ${canonical}s" for all of them, or "first ${canonical} of ${period}" for one.`,
    last.token,
  );
}

// Example: `first board meeting in q3` → cannot pick the first of a named set yet.
function diagnoseOrdinalOfNamedSet({ chunks, input, lookups, parses }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const first = chunks[0];
  if (first?.kind !== "ordinal" || chunks.length < 2) {
    return null;
  }

  const rest = input.slice(first.token.end).trim();
  const restNormalized = chunks
    .slice(1)
    .map((chunk) => chunk.token.normalized)
    .join(" ");
  const namesSet = Array.from(lookups.namedDatePhrases.keys()).some((phrase) =>
    new RegExp(`(^| )${escapeRegExp(phrase)}( |$)`).test(restNormalized),
  );
  if (!namesSet || !parses(rest)) {
    return null;
  }

  return unsupported(
    `Calchemy cannot pick the ${first.token.raw} of "${rest}" yet. Drop "${first.token.raw}" to list every one in the period.`,
    first.token,
  );
}

// Example: `tomorrow until march` → ends before it starts; add a year, for example `tomorrow until march 2027`.
function diagnoseInvertedRange(args: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const { slice, input, anchorDate, Temporal, context, lookups, parses } = args;
  const range = findRangeBoundary(slice.expression);
  if (!range) {
    return null;
  }

  const { start, end } = resolveRangeEndpoints(range, anchorDate, Temporal, context, lookups);
  if (!start || !end || comparePlainDate(start, end) <= 0) {
    return null;
  }

  const lead = `This range ends before it starts: it runs from ${start.toString()} to ${end.toString()}.`;
  const phrase = input.trim();
  for (let year = anchorDate.year; year <= anchorDate.year + 10; year += 1) {
    const candidate = `${phrase} ${year}`;
    if (parses(candidate)) {
      return {
        ...unsupported(`${lead} Add a year to the end, for example "${candidate}".`),
        suggestedInput: candidate,
      };
    }
  }

  return unsupported(`${lead} Swap the two ends.`);
}

// Example: `every other day` → `"every other day" needs a period, for example "every other day in june".`
function diagnoseNeedsPeriod({ input, parses }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const phrase = input.trim();
  const example = `${phrase} in june`;
  if (!parses(example)) {
    return null;
  }

  return { ...unsupported(`"${phrase}" needs a period, for example "${example}".`), suggestedInput: example };
}

// Example: keeps the old behaviour for an atom nothing else explains.
function diagnoseUnresolvedAtom({ slice, input, anchorDate, Temporal, context, lookups }: UnsupportedExpressionDiagnosis): ParseDateError | null {
  const token = findFirstUnresolvedAtomToken(slice, input, anchorDate, Temporal, context, lookups);
  return token ? unsupported(`Calchemy does not understand "${token.raw}".`, token) : null;
}

// Example: `findRangeBoundary(sampledRange)` digs through sampling and selection to the range underneath.
function findRangeBoundary(expression: DateExpression): Extract<BoundarySlice, { kind: "range" }> | null {
  if (expression.kind === "scope") {
    return expression.boundary.kind === "range" ? expression.boundary : null;
  }

  return findRangeBoundary(expression.inner);
}

// Example: `isDigitChunk(chunkFor("15"))` is true; `chunkFor("15th")` and `chunkFor("first")` are not.
function isDigitChunk(chunk: StandardChunk): boolean {
  return (chunk.kind === "ordinal" || chunk.kind === "number" || chunk.kind === "word") && /^\d+$/.test(chunk.token.raw);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unsupported(message: string, token?: Token): ParseDateError {
  return {
    code: "unsupported-expression",
    message,
    ...(token ? { token } : {}),
  };
}
