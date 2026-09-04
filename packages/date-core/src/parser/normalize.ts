import type { Correction, Token } from "../types";
import { ArticleWords, GrammarAliasMap, GrammarWordSet, PhraseShorthandMap, PhraseShorthandMaxWords } from "./types";
import {
  createDateVocabulary,
  createDateVocabularyLookups,
  hasVocabularyLookupValue,
  type DateVocabularyLookups,
} from "./vocabulary";

const DefaultLookups = createDateVocabularyLookups(createDateVocabulary());
const ArticleWordSet = new Set(ArticleWords);

// Treat the full family of Unicode dash and minus characters (hyphen, non-breaking hyphen,
// figure dash, en dash, em dash, horizontal bar, two/three-em dashes, minus sign, and the
// small/fullwidth compatibility forms) as a plain hyphen so ranges and date math parse the
// same regardless of which dash a user types or pastes.
const DashLikeCharacters = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B\u2212\uFE58\uFE63\uFF0D]/g;

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
    .replace(/\s*&\s*/g, " and ")
    .replace(DashLikeCharacters, "-")
    .replace(/\s+/g, " ");

  const corrections: Correction[] = [];
  const { tokens, settled } = expandNamedDatePhrases(tokenize(normalized), lookups, corrections);
  const correctedTokens = tokens
    .map((token, index): Token | null => {
      if (token.kind !== "word" || settled.has(token)) {
        return token;
      }

      if (ArticleWordSet.has(token.normalized as never)) {
        // `a week from now` and `in a month` count one unit. `the` never
        // does — `end of the year` — and every other article is filler.
        const next = tokens[index + 1];
        const countsOne =
          token.normalized !== "the" && next?.kind === "word" && lookups.durationUnits.has(next.normalized);
        return countsOne ? { ...token, kind: "number", normalized: "1" } : null;
      }

      const possessiveBase = stripKnownPossessive(token.normalized, lookups);
      if (possessiveBase) {
        return { ...token, normalized: possessiveBase };
      }

      const alias = lookups.aliases.get(token.normalized) ?? GrammarAliasMap.get(token.normalized);
      if (alias) {
        corrections.push({ from: token.normalized, to: alias, reason: "shorthand", confidence: 1 });
        return { ...token, normalized: alias };
      }

      // A grammar word or a shorthand we expand ourselves is known as typed;
      // without this, `fortnight` is "corrected" to `fortnightly`.
      if (GrammarWordSet.has(token.normalized) || PhraseShorthandMap.has(token.normalized)) {
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
  const expandedTokens = expandPhraseShorthands(correctedTokens, corrections);
  const semanticTokens = expandedTokens.filter((token, index) =>
    isSemanticToken(token, expandedTokens[index - 1], expandedTokens[index + 1]),
  );

  return {
    normalized: semanticTokens
      .map((token) => token.normalized)
      .join(" ")
      .replace(/\s+([,./-])\s+/g, "$1")
      .replace(/(^|\s)\.(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    tokens: semanticTokens,
    corrections,
  };
}

/**
 * Replaces named-date values and aliases with the tokens of their canonical
 * value, matching whole phrases so that multi-word names and aliases work.
 *
 * Every token that comes out of a match is "settled": the word-by-word pass
 * that follows leaves it alone. That is what stops a one-word alias such as
 * `board` from rewriting the first word of `board meeting` a second time. The
 * longest phrase at each position wins, and a verbatim value is kept as typed.
 *
 * Example: `expandNamedDatePhrases(tokensFor("quarterly board next year"), lookups, corrections)`
 * yields the tokens `board`, `meeting`, `next`, `year` and records
 * `quarterly board` → `board meeting`.
 */
function expandNamedDatePhrases(
  tokens: readonly Token[],
  lookups: DateVocabularyLookups,
  corrections: Correction[],
): { tokens: Token[]; settled: Set<Token> } {
  const settled = new Set<Token>();
  if (lookups.namedDatePhrases.size === 0) {
    return { tokens: [...tokens], settled };
  }

  const expanded: Token[] = [];
  let index = 0;

  while (index < tokens.length) {
    const match = matchNamedDatePhraseAt(tokens, index, lookups);
    if (!match) {
      expanded.push(tokens[index] as Token);
      index += 1;
      continue;
    }

    const matched = tokens.slice(index, index + match.length);
    if (match.phrase === match.value) {
      for (const token of matched) {
        settled.add(token);
        expanded.push(token);
      }
      index += match.length;
      continue;
    }

    const first = matched[0] as Token;
    const last = matched[matched.length - 1] as Token;
    const raw = matched.map((token) => token.raw).join(" ");
    corrections.push({ from: match.phrase, to: match.value, reason: "shorthand", confidence: 1 });

    for (const word of match.value.split(" ")) {
      const token: Token = { kind: "word", raw, normalized: word, start: first.start, end: last.end };
      settled.add(token);
      expanded.push(token);
    }

    index += match.length;
  }

  return { tokens: expanded, settled };
}

// Example: `matchNamedDatePhraseAt(tokensFor("quarterly board"), 0, lookups)` matches both words.
function matchNamedDatePhraseAt(
  tokens: readonly Token[],
  index: number,
  lookups: DateVocabularyLookups,
): { phrase: string; value: string; length: number } | null {
  for (let length = Math.min(lookups.namedDatePhraseMaxWords, tokens.length - index); length >= 1; length -= 1) {
    const candidate = tokens.slice(index, index + length);
    if (candidate.some((token) => token.kind !== "word")) {
      continue;
    }

    const phrase = candidate.map((token) => token.normalized).join(" ");
    const value = lookups.namedDatePhrases.get(phrase);
    if (value) {
      return { phrase, value, length };
    }

    // `board meetings` names the `board meeting` set, the way `mondays` names Monday.
    const singular = phrase.endsWith("s") ? phrase.slice(0, -1) : null;
    const pluralValue = singular ? lookups.namedDatePhrases.get(singular) : undefined;
    if (pluralValue) {
      return { phrase, value: pluralValue, length };
    }
  }

  return null;
}

/**
 * Replaces phrase shorthands with the tokens of the phrase they stand for.
 *
 * Every token produced from one shorthand keeps the shorthand's original span,
 * so a later diagnostic still points at what the user actually typed. Longer
 * shorthands win over shorter ones at the same position.
 *
 * Example: `expandPhraseShorthands(tokensFor("eom"), corrections)` yields the
 * tokens `end`, `of`, `this`, `month` and records `eom` → `end of this month`.
 */
function expandPhraseShorthands(tokens: readonly Token[], corrections: Correction[]): Token[] {
  const expanded: Token[] = [];
  let index = 0;

  while (index < tokens.length) {
    const match = matchPhraseShorthandAt(tokens, index);
    if (!match) {
      expanded.push(tokens[index] as Token);
      index += 1;
      continue;
    }

    const matched = tokens.slice(index, index + match.length);
    const first = matched[0] as Token;
    const last = matched[matched.length - 1] as Token;
    const raw = matched.map((token) => token.raw).join(" ");
    corrections.push({ from: match.shorthand, to: match.phrase, reason: "shorthand", confidence: 1 });

    for (const word of match.phrase.split(" ")) {
      expanded.push({
        kind: /^\d+$/.test(word) ? "number" : "word",
        raw,
        normalized: word,
        start: first.start,
        end: last.end,
      });
    }

    index += match.length;
  }

  return expanded;
}

// Example: `matchPhraseShorthandAt(tokensFor("year to date"), 0)` matches all three words.
function matchPhraseShorthandAt(
  tokens: readonly Token[],
  index: number,
): { shorthand: string; phrase: string; length: number } | null {
  for (let length = Math.min(PhraseShorthandMaxWords, tokens.length - index); length >= 1; length -= 1) {
    const candidate = tokens.slice(index, index + length);
    if (candidate.some((token) => token.kind !== "word")) {
      continue;
    }

    const shorthand = candidate.map((token) => token.normalized).join(" ");
    const phrase = PhraseShorthandMap.get(shorthand);
    if (phrase) {
      return { shorthand, phrase, length };
    }
  }

  return null;
}

// Example: `tokenize("q4-next year")` returns word, number, separator, and word tokens.
function tokenize(input: string): Token[] {
  const matches = input.matchAll(/\d+(?:st|nd|rd|th)?|[a-z']+|[.,/-]/g);

  return Array.from(matches, (match) => {
    const raw = match[0];
    const start = match.index ?? 0;
    const kind = /^\d+$/.test(raw) ? "number" : /^[a-z']+$/.test(raw) || /^\d+(?:st|nd|rd|th)$/.test(raw) ? "word" : "separator";

    return {
      kind,
      raw,
      normalized: raw,
      start,
      end: start + raw.length,
    };
  });
}

// Example: `isSemanticToken(".", numberToken, numberToken)` preserves dotted numeric dates.
function isSemanticToken(token: Token, previous: Token | undefined, next: Token | undefined): boolean {
  if (token.kind !== "separator") {
    return true;
  }

  if (token.normalized === ".") {
    return previous?.kind === "number" && next?.kind === "number";
  }

  return token.normalized !== ",";
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
  return GrammarWordSet.has(value) || hasVocabularyLookupValue(value, lookups) || lookups.fuzzyValues.includes(value);
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
export function levenshtein(a: string, b: string): number {
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
