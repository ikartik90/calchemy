import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { createCalchemyWithTemporal } from "../src";
import type { NamedDatesVocabularyEntry, ParseDateContext } from "../src";

/**
 * Error messages are part of the product: a user who types something the
 * parser cannot read must be told what went wrong and what to type instead.
 * Every row here pins the exact wording, so a change to a message is a
 * deliberate, reviewed change.
 */
const namedDatesVocabulary = [
  {
    value: "christmas",
    aliases: ["xmas"],
    isHoliday: true,
    resolveDate({ year, context }) {
      return context.referenceDate.with({ year, month: 12, day: 25 });
    },
  },
  {
    value: "board meeting",
    aliases: ["board"],
    resolveDates({ year, context }) {
      return [1, 4, 7, 10].map((month) => context.referenceDate.with({ year, month, day: 15 }));
    },
  },
] satisfies readonly NamedDatesVocabularyEntry[];
const calchemy = createCalchemyWithTemporal(Temporal, { namedDatesVocabulary });
const context: ParseDateContext = {
  referenceDate: Temporal.PlainDate.from("2026-05-27"),
  locale: "en-US",
  weekStartsOn: 0,
  dateOrderPreference: ["DMY", "MDY", "YMD"],
};

type ExpectedError = { code: string; message: string; suggestedInput?: string };

describe("error messages", () => {
  const rows: Array<[string, ExpectedError]> = [
    // Unknown words: name the word, and offer the closest known word when there is one.
    ["next qzxwv", { code: "unsupported-expression", message: 'Calchemy does not understand "qzxwv".' }],
    ["nxt week", { code: "unsupported-expression", message: 'Calchemy does not understand "nxt". Did you mean "next"?' }],
    ["easter", { code: "unsupported-expression", message: 'Calchemy does not understand "easter".' }],
    // A word from a multi-word named date is not a named date on its own.
    ["meeting tomorrow", { code: "unsupported-expression", message: 'Calchemy does not understand "meeting".' }],
    // Two-letter words get no "did you mean": `at` is one edit from too many words.
    ["next friday at 5pm", { code: "unsupported-expression", message: 'Calchemy reads dates only, not times. Drop "at 5pm".' }],
    ["the", { code: "unsupported-expression", message: 'Calchemy did not find a date in "the". Try "tomorrow", "next week", or "aug 15".' }],

    // A modifier or connector with nothing on the side it needs.
    ["next", { code: "unsupported-expression", message: '"next" needs a period after it, for example "next week".' }],
    ["from tomorrow", { code: "unsupported-expression", message: '"from tomorrow" needs an end, for example "from tomorrow until aug 15".' }],
    ["of next month", { code: "unsupported-expression", message: '"of" needs something to pick before it, for example "15th of next month".' }],

    // A range that ends before it starts, with the concrete dates. A floating end
    // gets the year that would make it work; a relative end cannot, so swap.
    [
      "tomorrow until march",
      {
        code: "unsupported-expression",
        message: 'This range ends before it starts: it runs from 2026-05-28 to 2026-03-31. Add a year to the end, for example "tomorrow until march 2027".',
        suggestedInput: "tomorrow until march 2027",
      },
    ],
    [
      "Every monday from tomorrow up to the end of march",
      {
        code: "unsupported-expression",
        message: 'This range ends before it starts: it runs from 2026-05-28 to 2026-03-31. Add a year to the end, for example "Every monday from tomorrow up to the end of march 2027".',
        suggestedInput: "Every monday from tomorrow up to the end of march 2027",
      },
    ],
    [
      "12 weeks from tomorrow until the end of q2",
      {
        code: "unsupported-expression",
        message: 'This range ends before it starts: it runs from 2026-08-20 to 2026-06-30. Add a year to the end, for example "12 weeks from tomorrow until the end of q2 2027".',
        suggestedInput: "12 weeks from tomorrow until the end of q2 2027",
      },
    ],
    [
      "tomorrow until yesterday",
      {
        code: "unsupported-expression",
        message: "This range ends before it starts: it runs from 2026-05-28 to 2026-05-26. Swap the two ends.",
      },
    ],

    // A connector with nothing after it.
    ["until", { code: "unsupported-expression", message: '"until" on its own is not a date phrase. It joins two parts, for example "tomorrow until aug 15".' }],
    ["5 pm tomorrow", { code: "unsupported-expression", message: 'Calchemy reads dates only, not times. Drop "5 pm tomorrow".' }],
    ["monday to", { code: "unsupported-expression", message: '"to" needs a date after it, for example "aug 15 to sep 30".' }],
    ["between aug 15 and", { code: "unsupported-expression", message: '"and" needs a second date after it, for example "between aug 15 and sep 30".' }],
    ["mondays in", { code: "unsupported-expression", message: '"in" needs a period after it, for example "mondays in june".' }],

    // A number with no unit, a unit with no number, a step of zero.
    ["in 3", { code: "unsupported-expression", message: '"3" needs a unit such as days, weeks, or months, for example "in 3 days".' }],
    ["3 from now", { code: "unsupported-expression", message: '"3" needs a unit such as days, weeks, or months, for example "3 days from now".' }],
    ["weeks from now", { code: "unsupported-expression", message: '"weeks" needs a number in front of it, for example "2 weeks from now".' }],
    ["every 0 days", { code: "unsupported-expression", message: '"every 0 days" never lands on a date. Use a step of 1 or more, for example "every 2 days".' }],

    // Numbers outside the calendar.
    ["the 32nd", { code: "unsupported-expression", message: "There is no 32nd day in any month. Days run from 1st to 31st." }],
    ["45th of next month", { code: "unsupported-expression", message: "There is no 45th day in any month. Days run from 1st to 31st." }],
    // Without a year these numbers roll into the next year (`m13` is January); with one they are outside the calendar.
    ["m13 2026", { code: "unsupported-expression", message: "There is no month 13 in 2026. Months run from m1 to m12." }],
    ["m13 next year", { code: "unsupported-expression", message: "There is no month 13 in 2027. Months run from m1 to m12." }],
    ["q5 2026", { code: "unsupported-expression", message: "There is no quarter 5 in 2026. Quarters run from q1 to q4." }],
    ["week 60 2026", { code: "unsupported-expression", message: "2026 has 53 weeks, so there is no week 60." }],
    ["w53 2027", { code: "unsupported-expression", message: "2027 has 52 weeks, so there is no week 53." }],

    // A numeric date written with spaces.
    [
      "2020 03 15",
      {
        code: "unsupported-expression",
        message: 'Calchemy does not read "2020 03 15" with spaces between the parts. Try "2020-03-15".',
        suggestedInput: "2020-03-15",
      },
    ],

    // Known words in an arrangement the grammar does not read, each with the nearest wording that works.
    ["next next week", { code: "unsupported-expression", message: '"next" is repeated. Use it once, for example "next week".' }],
    ["3rd friday", { code: "unsupported-expression", message: '"3rd friday" needs a period to count within, for example "3rd friday of next month".' }],
    [
      "next month monday",
      {
        code: "unsupported-expression",
        message: '"monday" on its own after "next month" is not read. Use "next month mondays" for all of them, or "first monday of next month" for one.',
      },
    ],
    [
      "first board meeting in q3",
      {
        code: "unsupported-expression",
        message: 'Calchemy cannot pick the first of "board meeting in q3" yet. Drop "first" to list every one in the period.',
      },
    ],
    ["excluding holidays", { code: "unsupported-expression", message: '"excluding holidays" needs a range to exclude from, for example "next month excluding holidays".' }],
    ["all", { code: "unsupported-expression", message: '"all" needs a day pattern and a period, for example "all mondays in june".' }],
    ["every other", { code: "unsupported-expression", message: '"every other" needs a day pattern and a period, for example "every other monday in june".' }],
    [
      "every other day",
      {
        code: "unsupported-expression",
        message: '"every other day" needs a period, for example "every other day in june".',
        suggestedInput: "every other day in june",
      },
    ],

    // When nothing more specific applies, say that the words are known but the arrangement is not.
    ["week of board meeting", { code: "unsupported-expression", message: "Calchemy knows these words but cannot read them in this order yet. Try a simpler wording." }],

    // Unchanged messages that already point the right way.
    ["", { code: "empty-input", message: "Enter a date phrase." }],
    ["31 april", { code: "impossible-date", message: "April 2026 has 30 days, so April 31 does not exist." }],
  ];

  test.each(rows)("explains %j", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      const error = result.errors[0];
      expect(error?.code).toBe(expected.code);
      expect(error?.message).toBe(expected.message);
      expect(error?.suggestedInput).toBe(expected.suggestedInput);
    }
  });

  test("a suggested input parses", () => {
    for (const input of ["tomorrow until march", "2020 03 15"]) {
      const result = calchemy.parseDate(input, context);
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") {
        const suggested = result.errors[0]?.suggestedInput;
        expect(suggested, input).toBeDefined();
        expect(calchemy.parseDate(suggested!, context).status, suggested).toBe("valid");
      }
    }
  });
});
