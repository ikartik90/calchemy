import {
  Scales,
  ScaleOrdinals,
  SmallCardinals,
  SmallOrdinals,
  Tens,
} from "../types";

// Example: `parseCardinalWords("one hundred twenty three")` returns `123`.
export function parseCardinalWords(value: string): number | null {
  const words = value.split(" ");
  let total = 0;
  let current = 0;
  let previousWasTens = false;

  for (const word of words) {
    const small = SmallCardinals.get(word);
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

    const tens = Tens.get(word);
    if (tens) {
      if (current % 100 !== 0) {
        return null;
      }

      current += tens;
      previousWasTens = true;
      continue;
    }

    const scale = Scales.get(word);
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

// Example: `parseAmount("twenty one")` returns `21`.
export function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
  if (Number.isFinite(Number(normalized))) {
    return Number(normalized);
  }

  return parseCardinalWords(normalized);
}

// Example: `parseOrdinal("fifty-second")` returns `52`.
export function parseOrdinal(input: string | undefined): number | null {
  if (!input) {
    return null;
  }

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const numericOrdinal = /^(\d+)\s*(?:st|nd|rd|th)$/.exec(normalized);
  if (numericOrdinal?.[1]) {
    return Number(numericOrdinal[1]);
  }

  const standalone = SmallOrdinals.get(normalized);
  if (standalone) {
    return standalone;
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

// Example: `parseCompoundOrdinal("one hundred third")` returns `103`, and `two thousandth` returns `2000`.
function parseCompoundOrdinal(input: string): number | null {
  const words = input.split(" ");
  const lastWord = words.at(-1);
  const ordinal = lastWord ? SmallOrdinals.get(lastWord) : undefined;
  const scaleWord = lastWord
    ? ScaleOrdinals.find(
        ([ordinalScaleWord]) => ordinalScaleWord === lastWord,
      )?.[1]
    : undefined;

  if (scaleWord) {
    return parseCardinalWords([...words.slice(0, -1), scaleWord].join(" "));
  }

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
