export const SMALL_CARDINALS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
]);

export const TENS = new Map([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);

export const SCALES = new Map([
  ["hundred", 100],
  ["thousand", 1000],
]);

const TEEN_ORDINALS = Array.from(SMALL_CARDINALS)
  .filter(([, value]) => value >= 13)
  .map(([word, value]) => [`${word}th`, value] as const);

const TENS_ORDINALS = Array.from(TENS, ([word, value]) => [`${word.slice(0, -1)}ieth`, value] as const);

const SCALE_ORDINALS = Array.from(SCALES, ([word]) => [`${word}th`, word] as const);

export const SMALL_ORDINALS = new Map([
  ["first", 1],
  ["second", 2],
  ["third", 3],
  ["fourth", 4],
  ["fifth", 5],
  ["sixth", 6],
  ["seventh", 7],
  ["eighth", 8],
  ["ninth", 9],
  ["tenth", 10],
  ["eleventh", 11],
  ["twelfth", 12],
  ...TEEN_ORDINALS,
  ...TENS_ORDINALS,
]);

// Parses cardinal number words including tens, hundreds, and thousands.
export function parseCardinalWords(value: string): number | null {
  const words = value.split(" ");
  let total = 0;
  let current = 0;
  let previousWasTens = false;

  for (const word of words) {
    const small = SMALL_CARDINALS.get(word);
    if (small) {
      if (previousWasTens && small > 9) {
        return null;
      }

      if (!previousWasTens && current % 100 !== 0) {
        return null;
      }

      current += small;
      previousWasTens = false;
      continue;
    }

    const tens = TENS.get(word);
    if (tens) {
      if (current % 100 !== 0) {
        return null;
      }

      current += tens;
      previousWasTens = true;
      continue;
    }

    const scale = SCALES.get(word);
    if (scale) {
      if (scale === 100) {
        current = Math.max(current, 1) * scale;
      } else {
        total += Math.max(current, 1) * scale;
        current = 0;
      }

      previousWasTens = false;
      continue;
    }

    return null;
  }

  return total + current || null;
}

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
  for (const [ordinalScaleWord, scaleWord] of SCALE_ORDINALS) {
    if (input.endsWith(ordinalScaleWord)) {
      return parseCardinalWords(`${input.slice(0, -ordinalScaleWord.length)}${scaleWord}`.trim());
    }
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
  if (!prefix) {
    return null;
  }

  if (ordinal < 10) {
    return prefix + ordinal;
  }

  return ordinal % 10 === 0 && prefix % 100 === 0 ? prefix + ordinal : null;
}
