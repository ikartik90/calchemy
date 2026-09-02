import type { StandardChunk } from "../chunks";
import { expandTwoDigitYear } from "../primitives/date-math";
import type { TemporalApi } from "../../temporal/types";
import type { ParseDateError, ResolvedParseDateContext, Token } from "../../types";

const MonthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type DateParts = { year: number; month: number; day: number };

/**
 * Explains a phrase that names a specific calendar date that does not exist,
 * such as `29 feb 2027` or `31 april 2027`.
 *
 * The parser understood these phrases; only the date they name is impossible.
 * Reporting them as unsupported expressions would be misleading, so this runs
 * before the unsupported-expression fallback.
 *
 * Example: `diagnoseImpossibleDate(chunks, "29 feb 2027", context, Temporal)`
 * reports that February 2027 has 28 days.
 */
export function diagnoseImpossibleDate(
  chunks: readonly StandardChunk[],
  input: string,
  normalizedInput: string,
  context: ResolvedParseDateContext,
  Temporal: TemporalApi,
): ParseDateError | null {
  const candidates =
    numericDateParts(normalizedInput, context) ?? namedMonthDateParts(chunks, context);
  if (!candidates || candidates.parts.length === 0) {
    return null;
  }

  // A phrase is only impossible when no reading of it lands on a real date.
  const explanations = candidates.parts.map((parts) => explainParts(parts, Temporal));
  if (explanations.some((explanation) => explanation === null)) {
    return null;
  }

  const best = pickMostInformative(
    explanations.filter((explanation): explanation is Explanation => explanation !== null),
  );
  if (!best) {
    return null;
  }

  const token = locateToken(candidates.text, input);

  return {
    code: "impossible-date",
    message: best.message,
    ...(token ? { token } : {}),
    ...(best.suggestions.length > 0 ? { suggestions: best.suggestions } : {}),
  };
}

type Explanation = {
  message: string;
  suggestions: string[];
  /** Higher wins when several readings are all impossible. */
  rank: number;
};

// Example: `explainParts({ year: 2027, month: 2, day: 29 }, Temporal)` reports a 28-day February.
function explainParts(parts: DateParts, Temporal: TemporalApi): Explanation | null {
  const { year, month, day } = parts;

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { message: `There is no month ${month}.`, suggestions: [], rank: 0 };
  }

  if (!Number.isInteger(day) || day < 1) {
    return { message: `There is no day ${day}.`, suggestions: [], rank: 0 };
  }

  const daysInMonth = monthLength(year, month, Temporal);
  if (daysInMonth === null) {
    return { message: `There is no year ${year}.`, suggestions: [], rank: 0 };
  }

  if (day <= daysInMonth) {
    return null;
  }

  const monthName = MonthNames[month - 1] ?? `Month ${month}`;
  const suggestions = [isoDate(year, month, daysInMonth)];
  let message = `${monthName} ${year} has ${daysInMonth} days, so ${monthName} ${day} does not exist.`;

  if (month === 2 && day === 29) {
    const nextLeapYear = findNextLeapYear(year, Temporal);
    message = `${year} is not a leap year, so ${monthName} 29 does not exist.`;
    if (nextLeapYear !== null) {
      suggestions.push(isoDate(nextLeapYear, 2, 29));
    }
  }

  // A day that overflows a real month is a far better explanation than a
  // reading where the month itself was nonsense, so rank it higher.
  return { message, suggestions, rank: 2 };
}

// Example: `pickMostInformative([...])` prefers a day overflow over an unknown month.
function pickMostInformative(explanations: readonly Explanation[]): Explanation | null {
  let best: Explanation | null = null;
  for (const explanation of explanations) {
    if (!best || explanation.rank > best.rank) {
      best = explanation;
    }
  }
  return best;
}

// Example: `monthLength(2027, 2, Temporal)` returns 28.
function monthLength(year: number, month: number, Temporal: TemporalApi): number | null {
  try {
    return Temporal.PlainDate.from({ year, month, day: 1 }, { overflow: "reject" }).daysInMonth;
  } catch {
    return null;
  }
}

// Example: `findNextLeapYear(2027, Temporal)` returns 2028.
function findNextLeapYear(year: number, Temporal: TemporalApi): number | null {
  for (let candidate = year + 1; candidate <= year + 8; candidate += 1) {
    if (monthLength(candidate, 2, Temporal) === 29) {
      return candidate;
    }
  }
  return null;
}

// Example: `isoDate(2027, 2, 28)` returns `2027-02-28`.
function isoDate(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${paddedMonth}-${paddedDay}`;
}

type PartCandidates = { text: string; parts: DateParts[] };

/**
 * Reads every plausible field order out of a bare numeric date such as
 * `2027-02-29` or `31/04/2027`.
 *
 * Example: `numericDateParts("2027-02-29", context)` yields the YMD reading.
 */
function numericDateParts(
  normalizedInput: string,
  context: ResolvedParseDateContext,
): PartCandidates | null {
  const match = /^(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})$/.exec(normalizedInput.trim());
  if (!match) {
    return null;
  }

  const [text, first, , second, third] = match;
  if (!first || !second || !third) {
    return null;
  }

  const a = Number(first);
  const b = Number(second);
  const c = Number(third);
  const anchorYear = context.referenceDate.year;
  const leadingYear = /^\d{4}/.test(first);

  const parts: DateParts[] = leadingYear
    ? [{ year: a, month: b, day: c }]
    : [
        { year: expandTwoDigitYear(c, anchorYear), month: b, day: a },
        { year: expandTwoDigitYear(c, anchorYear), month: a, day: b },
      ];

  return { text, parts };
}

/**
 * Reads a month name paired with a day number, as in `29 feb 2027`,
 * `feb 30 2027`, or `31 april`.
 *
 * Example: `namedMonthDateParts(chunksFor("29 feb 2027"), context)` yields
 * February 29th, 2027.
 */
function namedMonthDateParts(
  chunks: readonly StandardChunk[],
  context: ResolvedParseDateContext,
): PartCandidates | null {
  const relevant = chunks.filter((chunk) => chunk.kind !== "separator");
  const monthIndex = relevant.findIndex((chunk) => chunk.kind === "month");
  const monthChunk = relevant[monthIndex];
  if (!monthChunk || monthChunk.kind !== "month") {
    return null;
  }

  const numbers = relevant.filter(
    (chunk): chunk is Extract<StandardChunk, { kind: "number" | "ordinal" }> =>
      chunk.kind === "number" || chunk.kind === "ordinal",
  );

  // Anything richer than "<month> <day> [<year>]" is a phrase this diagnostic
  // has no business explaining.
  if (numbers.length === 0 || numbers.length > 2 || relevant.length !== numbers.length + 1) {
    return null;
  }

  const dayChunk = numbers.find((chunk) => chunk.value >= 1 && chunk.value <= 31);
  const yearChunk = numbers.find((chunk) => chunk !== dayChunk);
  if (!dayChunk) {
    return null;
  }

  const year =
    yearChunk === undefined
      ? context.referenceDate.year
      : expandTwoDigitYear(yearChunk.value, context.referenceDate.year);

  const tokens = relevant.map((chunk) => chunk.token);
  const start = Math.min(...tokens.map((token) => token.start));
  const end = Math.max(...tokens.map((token) => token.end));

  return {
    text: `${start}:${end}`,
    parts: [{ year, month: monthChunk.value, day: dayChunk.value }],
  };
}

/**
 * Locates the offending span in the original input. `text` is either the literal
 * matched text or a `start:end` offset pair produced from token positions.
 */
function locateToken(text: string, input: string): Token | undefined {
  const offsets = /^(\d+):(\d+)$/.exec(text);
  if (offsets?.[1] !== undefined && offsets[2] !== undefined) {
    const start = Number(offsets[1]);
    const end = Number(offsets[2]);
    const raw = input.slice(start, end);
    return raw
      ? { kind: "word", raw, normalized: raw.toLowerCase(), start, end }
      : undefined;
  }

  const start = input.toLowerCase().indexOf(text.toLowerCase());
  if (start < 0) {
    return undefined;
  }

  const end = start + text.length;
  return {
    kind: "word",
    raw: input.slice(start, end),
    normalized: text.toLowerCase(),
    start,
    end,
  };
}
