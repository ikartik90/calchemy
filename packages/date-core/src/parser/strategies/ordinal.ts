import { parseCardinalWords, SMALL_ORDINALS } from "./number-words";

// Parses natural-language ordinal positions, including numeric suffixes and multiplier words.
export function parseOrdinal(input: string | undefined): number | null {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const numericOrdinal = /^(\d+)\s*(?:st|nd|rd|th)$/.exec(normalized);
  if (numericOrdinal?.[1]) {
    return Number(numericOrdinal[1]);
  }

  const standalone = SMALL_ORDINALS.get(normalized);
  if (standalone) {
    return standalone;
  }

  const multiplierOrdinal = parseMultiplierOrdinal(normalized);
  if (multiplierOrdinal) {
    return multiplierOrdinal;
  }

  const compoundOrdinal = parseCompoundOrdinal(normalized);
  if (compoundOrdinal) {
    return compoundOrdinal;
  }

  const cardinal = parseCardinalWords(normalized);
  if (cardinal) {
    return cardinal;
  }
  return null;
}

// Parses multiplier ordinals such as "hundredth" or "two thousandth".
function parseMultiplierOrdinal(input: string): number | null {
  if (input.endsWith("hundredth")) {
    return parseCardinalWords(input.replace(/hundredth$/, "hundred"));
  }

  if (input.endsWith("thousandth")) {
    return parseCardinalWords(input.replace(/thousandth$/, "thousand"));
  }

  return null;
}

// Parses ordinals where only the final word is ordinal, such as "one hundred third".
function parseCompoundOrdinal(input: string): number | null {
  const words = input.split(" ");
  const lastWord = words.at(-1);
  const ordinal = lastWord ? SMALL_ORDINALS.get(lastWord) : undefined;
  if (!lastWord || !ordinal || words.length < 2) {
    return null;
  }

  const prefix = parseCardinalWords(words.slice(0, -1).join(" "));
  return prefix && ordinal < 10 ? prefix + ordinal : null;
}
