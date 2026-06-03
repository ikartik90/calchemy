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
  ["thirteenth", 13],
  ["fourteenth", 14],
  ["fifteenth", 15],
  ["sixteenth", 16],
  ["seventeenth", 17],
  ["eighteenth", 18],
  ["nineteenth", 19],
  ["twentieth", 20],
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

    if (word === "hundred") {
      current = Math.max(current, 1) * 100;
      previousWasTens = false;
      continue;
    }

    if (word === "thousand") {
      total += Math.max(current, 1) * 1000;
      current = 0;
      previousWasTens = false;
      continue;
    }

    return null;
  }

  return total + current || null;
}
