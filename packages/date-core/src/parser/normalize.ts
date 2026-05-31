import type { Correction, Token } from "../types";
import { createDateVocabulary, createDateVocabularyLookups, type DateVocabularyLookups } from "./vocabulary";

const DEFAULT_LOOKUPS = createDateVocabularyLookups(createDateVocabulary());
const GRAMMAR_WORDS = new Set([
  "after",
  "all",
  "alternate",
  "and",
  "before",
  "between",
  "date",
  "dates",
  "end",
  "even",
  "except",
  "excluding",
  "every",
  "eight",
  "eighteen",
  "eighteenth",
  "eighth",
  "eleven",
  "eleventh",
  "fifth",
  "fifteen",
  "fifteenth",
  "fifty",
  "first",
  "five",
  "forty",
  "four",
  "fourteen",
  "fourteenth",
  "fourth",
  "for",
  "following",
  "from",
  "holidays",
  "hundred",
  "hundredth",
  "in",
  "minus",
  "nine",
  "nineteen",
  "nineteenth",
  "ninth",
  "numbered",
  "odd",
  "of",
  "one",
  "or",
  "other",
  "plus",
  "second",
  "seven",
  "seventeen",
  "seventeenth",
  "seventh",
  "select",
  "six",
  "sixteen",
  "sixteenth",
  "sixth",
  "skip",
  "sixty",
  "ten",
  "tenth",
  "the",
  "thirteen",
  "thirteenth",
  "thirty",
  "third",
  "to",
  "twelve",
  "twelfth",
  "twentieth",
  "twenty",
  "two",
  "until",
  "week",
  "weekday",
  "weekdays",
  "weekend",
  "weekends",
  "thousand",
  "thousandth",
]);

export type NormalizedInput = {
  normalized: string;
  tokens: Token[];
  corrections: Correction[];
};

export function normalizeInput(input: string, lookups: DateVocabularyLookups = DEFAULT_LOOKUPS): NormalizedInput {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  const tokens = tokenize(normalized);
  const corrections: Correction[] = [];
  const corrected = tokens.map((token) => {
    if (token.kind !== "word") {
      return token.normalized;
    }

    const alias = lookups.aliases.get(token.normalized);
    if (alias) {
      corrections.push({ from: token.normalized, to: alias, reason: "shorthand", confidence: 1 });
      return alias;
    }

    if (GRAMMAR_WORDS.has(token.normalized)) {
      return token.normalized;
    }

    const fuzzy = findFuzzyMatch(token.normalized, lookups.fuzzyValues);
    if (fuzzy) {
      corrections.push({ from: token.normalized, to: fuzzy, reason: "typo", confidence: 0.86 });
      return fuzzy;
    }

    return token.normalized;
  });

  return {
    normalized: corrected
      .join(" ")
      .replace(/\s+([,./-])\s+/g, "$1")
      .replace(/(^|\s)\.(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    tokens,
    corrections,
  };
}

function tokenize(input: string): Token[] {
  const matches = input.matchAll(/\d+|[a-z']+|[.,/-]/g);

  return Array.from(matches, (match) => {
    const raw = match[0];
    const start = match.index ?? 0;
    const kind = /^\d+$/.test(raw) ? "number" : /^[a-z']+$/.test(raw) ? "word" : "separator";

    return {
      kind,
      raw,
      normalized: raw,
      start,
      end: start + raw.length,
    };
  });
}

function findFuzzyMatch(value: string, vocabulary: readonly string[]): string | null {
  if (vocabulary.includes(value)) {
    return null;
  }

  if (value.length < 5) {
    return null;
  }

  const match = vocabulary.find((candidate) => levenshtein(value, candidate) <= 2);
  return match ?? null;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + substitutionCost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j] ?? 0;
    }
  }

  return previous[b.length] ?? 0;
}
