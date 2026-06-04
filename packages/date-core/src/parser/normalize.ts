import type { Correction, Token } from "../types";
import { ArticleWords, GrammarWordSet } from "./types";
import { createDateVocabulary, createDateVocabularyLookups, type DateVocabularyLookups } from "./vocabulary";

const DefaultLookups = createDateVocabularyLookups(createDateVocabulary());
const ArticleWordSet = new Set(ArticleWords);

export type NormalizedInput = {
  normalized: string;
  tokens: Token[];
  corrections: Correction[];
};

// Example: `normalizeInput("tmrw")` returns normalized `tomorrow` plus shorthand correction metadata.
export function normalizeInput(input: string, lookups: DateVocabularyLookups = DefaultLookups): NormalizedInput {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\+/g, " plus ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  const tokens = tokenize(normalized);
  const corrections: Correction[] = [];
  const correctedTokens = tokens
    .map((token): Token | null => {
      if (token.kind !== "word") {
        return token;
      }

      if (ArticleWordSet.has(token.normalized as never)) {
        return null;
      }

      const possessiveBase = stripKnownPossessive(token.normalized, lookups);
      if (possessiveBase) {
        return { ...token, normalized: possessiveBase };
      }

      const alias = lookups.aliases.get(token.normalized);
      if (alias) {
        corrections.push({ from: token.normalized, to: alias, reason: "shorthand", confidence: 1 });
        return { ...token, normalized: alias };
      }

      if (GrammarWordSet.has(token.normalized)) {
        return token;
      }

      const fuzzy = findFuzzyMatch(token.normalized, lookups.fuzzyValues);
      if (fuzzy) {
        corrections.push({ from: token.normalized, to: fuzzy, reason: "typo", confidence: 0.86 });
        return { ...token, normalized: fuzzy };
      }

      return token;
    })
    .filter((token): token is Token => token !== null);

  return {
    normalized: correctedTokens
      .map((token) => token.normalized)
      .join(" ")
      .replace(/\s+([,./-])\s+/g, "$1")
      .replace(/(^|\s)\.(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    tokens: correctedTokens,
    corrections,
  };
}

// Example: `tokenize("q4-next year")` returns word, number, separator, and word tokens.
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

// Example: `stripKnownPossessive("week's", lookups)` returns `week` when it is known vocabulary.
function stripKnownPossessive(value: string, lookups: DateVocabularyLookups): string | null {
  const base = getPossessiveBase(value);
  if (!base) {
    return null;
  }

  return isKnownWord(base, lookups) ? base : null;
}

// Example: `getPossessiveBase("years'")` returns `years`.
function getPossessiveBase(value: string): string | null {
  if (value.endsWith("'s")) {
    return value.slice(0, -2);
  }

  if (value.endsWith("'")) {
    return value.slice(0, -1);
  }

  return null;
}

// Example: `isKnownWord("february", lookups)` returns true for month vocabulary.
function isKnownWord(value: string, lookups: DateVocabularyLookups): boolean {
  return (
    GrammarWordSet.has(value) ||
    lookups.aliases.has(value) ||
    lookups.months.has(value) ||
    lookups.weekdays.has(value) ||
    lookups.durationUnits.has(value) ||
    lookups.relatives.has(value as never) ||
    lookups.fuzzyValues.includes(value)
  );
}

// Example: `findFuzzyMatch("febuary", ["february"])` returns `february`.
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

// Example: `levenshtein("march", "marhc")` returns the edit distance between the words.
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
