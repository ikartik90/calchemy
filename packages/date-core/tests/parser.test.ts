import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { parseOrdinal } from "../src/parser/strategies/ordinal";
import { parseAmount } from "../src/parser/strategies/shared";
import { createCalchemyWithTemporal, isDateValueJSON } from "../src";
import type { CompletionSource, DateValueJSON, HolidayProvider, NamedDatesVocabularyEntry, ParseDateContext } from "../src";

const anchor = Temporal.ZonedDateTime.from("2026-05-27T12:00:00-04:00[America/New_York]");
const holidays: HolidayProvider = {
  id: "test",
  label: "Test holidays",
  includes(date) {
    return date.toString() === "2026-06-06" || date.toString() === "2026-12-25";
  },
};
const namedDatesVocabulary = [
  {
    value: "christmas",
    shortcuts: ["xmas"],
    resolveDate({ year, context }) {
      return context.anchor.toPlainDate().with({ year, month: 12, day: 25 });
    },
  },
  {
    value: "easter",
    shortcuts: [],
    resolveDate({ year }) {
      return getEasterDate(year);
    },
  },
] satisfies readonly NamedDatesVocabularyEntry[];
const calchemy = createCalchemyWithTemporal(Temporal, { namedDatesVocabulary });
const context: ParseDateContext = {
  anchor,
  locale: "en-US",
  weekStartsOn: 0,
  dateOrderPreference: ["DMY", "MDY", "YMD"],
  holidays,
};

describe("parseDate", () => {
  test("rejects constrained numeric date interpretations", () => {
    const result = calchemy.parseDate("2026-11-10", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({ kind: "single", date: "2026-11-10" });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.id).toBe("ymd");
    }
  });

  test.each([
    ["today", { kind: "single", date: "2026-05-27" }],
    ["tomorrow", { kind: "single", date: "2026-05-28" }],
    ["three weeks from now", { kind: "single", date: "2026-06-17" }],
    ["2 yrs from now", { kind: "single", date: "2028-05-27" }],
    ["last 90 days", { kind: "range", start: "2026-02-27", end: "2026-05-27" }],
    ["past 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["previous 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["upcoming 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["next 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["future 2 weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }],
    ["Christmas 2026-Jul 1, 27", { kind: "range", start: "2026-12-25", end: "2027-07-01" }],
    ["from christmas to 7/1/2027", { kind: "range", start: "2026-12-25", end: "2027-01-07" }],
    ["from christmas to 7-1-2027", { kind: "range", start: "2026-12-25", end: "2027-01-07" }],
    ["from christmas to 7.1.2027", { kind: "range", start: "2026-12-25", end: "2027-01-07" }],
    ["2026-11-10/2026-11-24", { kind: "range", start: "2026-11-10", end: "2026-11-24" }],
    ["between christmas and jul 1 2027", { kind: "range", start: "2026-12-25", end: "2027-07-01" }],
    ["Q1", { kind: "range", start: "2026-01-01", end: "2026-03-31" }],
    ["q2", { kind: "range", start: "2026-04-01", end: "2026-06-30" }],
    ["Q3 2027", { kind: "range", start: "2027-07-01", end: "2027-09-30" }],
    ["Q4 next year", { kind: "range", start: "2027-10-01", end: "2027-12-31" }],
    ["this quarter", { kind: "range", start: "2026-04-01", end: "2026-06-30" }],
    ["next quarter", { kind: "range", start: "2026-07-01", end: "2026-09-30" }],
    ["previous quarter", { kind: "range", start: "2026-01-01", end: "2026-03-31" }],
    ["first quarter of next year", { kind: "range", start: "2027-01-01", end: "2027-03-31" }],
    ["second quarter of 2027", { kind: "range", start: "2027-04-01", end: "2027-06-30" }],
    ["week 52", { kind: "range", start: "2026-12-21", end: "2026-12-27" }],
    ["week fifty-two", { kind: "range", start: "2026-12-21", end: "2026-12-27" }],
    ["week fifty two", { kind: "range", start: "2026-12-21", end: "2026-12-27" }],
    ["week one next year", { kind: "range", start: "2027-01-04", end: "2027-01-10" }],
    ["next monday in march plus two weeks", { kind: "single", date: "2027-03-15" }],
    ["next monday in march + two weeks", { kind: "single", date: "2027-03-15" }],
    ["next monday in march + 2 weeks", { kind: "single", date: "2027-03-15" }],
    ["next monday in march+two weeks", { kind: "single", date: "2027-03-15" }],
    ["next monday in march+2 weeks", { kind: "single", date: "2027-03-15" }],
    ["next monday in march minus two weeks", { kind: "single", date: "2027-02-15" }],
    ["next monday in march - two weeks", { kind: "single", date: "2027-02-15" }],
    ["next monday in march - 2 weeks", { kind: "single", date: "2027-02-15" }],
    ["next monday in march-two weeks", { kind: "single", date: "2027-02-15" }],
    ["next monday in march-2 weeks", { kind: "single", date: "2027-02-15" }],
    ["tuesday following today +3 weeks", { kind: "single", date: "2026-06-23" }],
    ["tuesday following today+3 weeks", { kind: "single", date: "2026-06-23" }],
    ["tuesday following today -3 weeks", { kind: "single", date: "2026-05-12" }],
    ["tuesday before today +3 weeks", { kind: "single", date: "2026-06-16" }],
    ["the thursday before next weekend", { kind: "single", date: "2026-06-04" }],
    ["the monday after next weekend", { kind: "single", date: "2026-06-08" }],
    ["jul 1", { kind: "single", date: "2026-07-01" }],
    ["jan 5", { kind: "single", date: "2026-01-05" }],
    ["christmas this year", { kind: "single", date: "2026-12-25" }],
    ["easter next year", { kind: "single", date: "2027-03-28" }],
  ] satisfies Array<[string, DateValueJSON]>)("parses %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual(expected);
    }
  });

  test.each([
    ["this friday", { kind: "single", date: "2026-05-29" }],
    ["next friday", { kind: "single", date: "2026-06-05" }],
    ["last friday", { kind: "single", date: "2026-05-22" }],
    ["previous friday", { kind: "single", date: "2026-05-22" }],
    ["this wednesday", { kind: "single", date: "2026-05-27" }],
    ["next wednesday", { kind: "single", date: "2026-06-03" }],
  ] satisfies Array<[string, DateValueJSON]>)("parses relative weekday %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual(expected);
    }
  });

  test.each([
    ["this day", { kind: "range", start: "2026-05-27", end: "2026-05-27" }],
    ["next day", { kind: "range", start: "2026-05-28", end: "2026-05-28" }],
    ["last day", { kind: "range", start: "2026-05-26", end: "2026-05-26" }],
    ["this week", { kind: "range", start: "2026-05-24", end: "2026-05-30" }],
    ["next week", { kind: "range", start: "2026-05-31", end: "2026-06-06" }],
    ["previous week", { kind: "range", start: "2026-05-17", end: "2026-05-23" }],
    ["this weekdays", { kind: "range", start: "2026-05-25", end: "2026-05-29" }],
    ["next weekdays", { kind: "range", start: "2026-06-01", end: "2026-06-05" }],
    ["previous weekdays", { kind: "range", start: "2026-05-18", end: "2026-05-22" }],
    ["this weekend", { kind: "range", start: "2026-05-30", end: "2026-05-31" }],
    ["upcoming weekend", { kind: "range", start: "2026-05-30", end: "2026-05-31" }],
    ["next weekend", { kind: "range", start: "2026-06-06", end: "2026-06-07" }],
    ["previous weekend", { kind: "range", start: "2026-05-23", end: "2026-05-24" }],
    ["this month", { kind: "range", start: "2026-05-01", end: "2026-05-31" }],
    ["next month", { kind: "range", start: "2026-06-01", end: "2026-06-30" }],
    ["last month", { kind: "range", start: "2026-04-01", end: "2026-04-30" }],
    ["this year", { kind: "range", start: "2026-01-01", end: "2026-12-31" }],
    ["next year", { kind: "range", start: "2027-01-01", end: "2027-12-31" }],
    ["previous year", { kind: "range", start: "2025-01-01", end: "2025-12-31" }],
  ] satisfies Array<[string, DateValueJSON]>)("parses relative calendar range %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual(expected);
    }
  });

  test.each([
    ["next 3 fridays", { kind: "multiple", dates: ["2026-05-29", "2026-06-05", "2026-06-12"] }],
    ["future 3 fridays", { kind: "multiple", dates: ["2026-05-29", "2026-06-05", "2026-06-12"] }],
    ["past 3 mondays", { kind: "multiple", dates: ["2026-05-25", "2026-05-18", "2026-05-11"] }],
    ["previous 3 mondays", { kind: "multiple", dates: ["2026-05-25", "2026-05-18", "2026-05-11"] }],
  ] satisfies Array<[string, DateValueJSON]>)("parses counted weekday recurrence %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual(expected);
    }
  });

  test("selects weekdays between named date anchors", () => {
    const result = calchemy.parseDate(
      "select tuesdays and thursdays between christmas this year and easter next year",
      context,
    );

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-29",
          "2026-12-31",
          "2027-01-05",
          "2027-01-07",
          "2027-01-12",
          "2027-01-14",
          "2027-01-19",
          "2027-01-21",
          "2027-01-26",
          "2027-01-28",
          "2027-02-02",
          "2027-02-04",
          "2027-02-09",
          "2027-02-11",
          "2027-02-16",
          "2027-02-18",
          "2027-02-23",
          "2027-02-25",
          "2027-03-02",
          "2027-03-04",
          "2027-03-09",
          "2027-03-11",
          "2027-03-16",
          "2027-03-18",
          "2027-03-23",
          "2027-03-25",
        ],
      });
    }
  });

  test("selects ordinal weekday after a named date anchor", () => {
    const result = calchemy.parseDate("select first thursday after christmas this year", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({ kind: "single", date: "2026-12-31" });
    }
  });

  test("selects compound ordinal weekday after a named date anchor", () => {
    const result = calchemy.parseDate("select twenty-first thursday after christmas this year", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({ kind: "single", date: "2027-05-20" });
    }
  });

  test("selects weekdays for a relative duration range", () => {
    const result = calchemy.parseDate("all mondays for the next 3 months", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-06-01",
          "2026-06-08",
          "2026-06-15",
          "2026-06-22",
          "2026-06-29",
          "2026-07-06",
          "2026-07-13",
          "2026-07-20",
          "2026-07-27",
          "2026-08-03",
          "2026-08-10",
          "2026-08-17",
          "2026-08-24",
        ],
      });
    }
  });

  test.each([
    ["all tuesdays in Q4"],
    ["all tuesdays from Q4"],
  ])("selects weekdays in a quarter range: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-10-06",
          "2026-10-13",
          "2026-10-20",
          "2026-10-27",
          "2026-11-03",
          "2026-11-10",
          "2026-11-17",
          "2026-11-24",
          "2026-12-01",
          "2026-12-08",
          "2026-12-15",
          "2026-12-22",
          "2026-12-29",
        ],
      });
    }
  });

  test("selects weekdays in a relative quarter range", () => {
    const result = calchemy.parseDate("all tuesdays in next quarter", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-07",
          "2026-07-14",
          "2026-07-21",
          "2026-07-28",
          "2026-08-04",
          "2026-08-11",
          "2026-08-18",
          "2026-08-25",
          "2026-09-01",
          "2026-09-08",
          "2026-09-15",
          "2026-09-22",
          "2026-09-29",
        ],
      });
    }
  });

  test("selects weekdays in an ordinal quarter range", () => {
    const result = calchemy.parseDate("all fridays in the first quarter of next year", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2027-01-01",
          "2027-01-08",
          "2027-01-15",
          "2027-01-22",
          "2027-01-29",
          "2027-02-05",
          "2027-02-12",
          "2027-02-19",
          "2027-02-26",
          "2027-03-05",
          "2027-03-12",
          "2027-03-19",
          "2027-03-26",
        ],
      });
    }
  });

  test("selects weekdays in an ordinal week range", () => {
    const result = calchemy.parseDate("tuesday and friday of the 52nd week", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-12-22", "2026-12-25"],
      });
    }
  });

  test("selects weekdays in a multiplier ordinal week range", () => {
    const result = calchemy.parseDate("tuesday and friday of the hundredth week", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2027-11-23", "2027-11-26"],
      });
    }
  });

  test("selects weekdays in a hundred-day relative range", () => {
    const result = calchemy.parseDate("tuesday and friday of the last hundred days", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-02-17",
          "2026-02-20",
          "2026-02-24",
          "2026-02-27",
          "2026-03-03",
          "2026-03-06",
          "2026-03-10",
          "2026-03-13",
          "2026-03-17",
          "2026-03-20",
          "2026-03-24",
          "2026-03-27",
          "2026-03-31",
          "2026-04-03",
          "2026-04-07",
          "2026-04-10",
          "2026-04-14",
          "2026-04-17",
          "2026-04-21",
          "2026-04-24",
          "2026-04-28",
          "2026-05-01",
          "2026-05-05",
          "2026-05-08",
          "2026-05-12",
          "2026-05-15",
          "2026-05-19",
          "2026-05-22",
          "2026-05-26",
        ],
      });
    }
  });

  test.each([
    ["alternate mondays for the next 3 months"],
    ["every other monday for the next 3 months"],
  ])("selects alternate weekdays for a relative duration range: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-06-01",
          "2026-06-15",
          "2026-06-29",
          "2026-07-13",
          "2026-07-27",
          "2026-08-10",
          "2026-08-24",
        ],
      });
    }
  });

  test("selects odd numbered dates in a month and skips holidays", () => {
    const result = calchemy.parseDate("all odd numbered dates in december. skip holidays", context);

    expect(result.status).toBe("valid");
    expect(result.corrections).toEqual([]);
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-01",
          "2026-12-03",
          "2026-12-05",
          "2026-12-07",
          "2026-12-09",
          "2026-12-11",
          "2026-12-13",
          "2026-12-15",
          "2026-12-17",
          "2026-12-19",
          "2026-12-21",
          "2026-12-23",
          "2026-12-27",
          "2026-12-29",
          "2026-12-31",
        ],
      });
    }
  });

  test("parses recurring weekdays until the end of next month", () => {
    const result = calchemy.parseDate("all mon and sat until end of next month", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-05-30",
          "2026-06-01",
          "2026-06-06",
          "2026-06-08",
          "2026-06-13",
          "2026-06-15",
          "2026-06-20",
          "2026-06-22",
          "2026-06-27",
          "2026-06-29",
        ],
      });
    }
  });

  test("supports exclusions for holidays", () => {
    const result = calchemy.parseDate(
      "all mon and sat until the first monday after the end of next month excluding holidays",
      context,
    );

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-05-30",
          "2026-06-01",
          "2026-06-08",
          "2026-06-13",
          "2026-06-15",
          "2026-06-20",
          "2026-06-22",
          "2026-06-27",
          "2026-06-29",
          "2026-07-04",
          "2026-07-06",
        ],
      });
    }
  });

  test("returns ambiguity for numeric dates", () => {
    const result = calchemy.parseDate("03/04/25", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("date-order");
      expect(result.candidates.map((candidate) => calchemy.toJSON(candidate.value))).toEqual([
        { kind: "single", date: "2025-04-03" },
        { kind: "single", date: "2025-03-04" },
        { kind: "single", date: "2003-04-25" },
      ]);
    }
  });

  test("allows date order preference through parser initialization", () => {
    const ymdCalchemy = createCalchemyWithTemporal(Temporal, {
      defaultContext: {
        anchor,
        dateOrderPreference: ["YMD"],
      },
    });
    const result = ymdCalchemy.parseDate("2025/03/04");

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(ymdCalchemy.toJSON(result.value)).toEqual({ kind: "single", date: "2025-03-04" });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.id).toBe("ymd");
    }
  });

  test("tracks shorthand and typo corrections", () => {
    const result = calchemy.parseDate("tmrw", context);

    expect(result.status).toBe("valid");
    expect(result.corrections).toEqual([
      { from: "tmrw", to: "tomorrow", reason: "shorthand", confidence: 1 },
    ]);
  });

  test("requires named-date vocabulary for named dates", () => {
    const defaultCalchemy = createCalchemyWithTemporal(Temporal);
    const defaultResult = defaultCalchemy.parseDate("christmas", context);
    const configuredResult = calchemy.parseDate("xmas", context);

    expect(defaultResult.status).toBe("invalid");
    expect(configuredResult.status).toBe("valid");
    expect(configuredResult.corrections).toEqual([
      { from: "xmas", to: "christmas", reason: "shorthand", confidence: 1 },
    ]);
    if (configuredResult.status === "valid") {
      expect(calchemy.toJSON(configuredResult.value)).toEqual({ kind: "single", date: "2026-12-25" });
    }
  });
});

describe("ordinals", () => {
  test.each([
    ["first", 1],
    ["nineteenth", 19],
    ["twentieth", 20],
    ["one", 1],
    ["two", 2],
    ["twenty", 20],
    ["twenty first", 21],
    ["twenty-first", 21],
    ["fifty two", 52],
    ["fifty-two", 52],
    ["52", 52],
    ["52nd", 52],
    ["52 nd", 52],
    ["thirty second", 32],
    ["thirty-second", 32],
    ["hundredth", 100],
    ["one hundredth", 100],
    ["two hundredth", 200],
    ["thousandth", 1000],
    ["one thousandth", 1000],
    ["one hundred twenty third", 123],
  ])("parses %s", (input, expected) => {
    expect(parseOrdinal(input)).toBe(expected);
  });

  test.each(["twenty ten", "first second"])("rejects %s", (input) => {
    expect(parseOrdinal(input)).toBeNull();
  });
});

describe("amounts", () => {
  test.each([
    ["hundred", 100],
    ["one hundred", 100],
    ["two hundred", 200],
    ["thousand", 1000],
    ["one thousand", 1000],
    ["two thousand", 2000],
    ["one hundred twenty three", 123],
    ["one thousand two hundred thirty four", 1234],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});

function getEasterDate(year: number): Temporal.PlainDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return Temporal.PlainDate.from({ year, month, day });
}

describe("inline completions", () => {
  test("does not include parser vocabulary as default completions", () => {
    const defaultCalchemy = createCalchemyWithTemporal(Temporal);

    expect(defaultCalchemy.getInlineCompletion("tom")).toBeNull();
    expect(defaultCalchemy.getInlineCompletion("jul")).toBeNull();
  });

  test("uses caller-provided completions without replacing typed input", () => {
    const completionSources = [
      {
        id: "user",
        entries: [{ value: "previous 90 days" }],
      },
    ] satisfies readonly CompletionSource[];
    const completionCalchemy = createCalchemyWithTemporal(Temporal, { completionSources });

    expect(completionCalchemy.getInlineCompletion("prev")).toEqual({
      value: "previous 90 days",
      suffix: "ious 90 days",
      sourceId: "user",
    });
    expect(completionCalchemy.getInlineCompletion("previous 90 days")).toBeNull();
  });

  test("uses source order to pick completion matches", () => {
    const completionCalchemy = createCalchemyWithTemporal(Temporal, {
      completionSources: [
        { id: "user", entries: [{ value: "previous month" }] },
        { id: "team", entries: [{ value: "previous 90 days" }] },
      ],
    });

    expect(completionCalchemy.getInlineCompletion("prev")).toEqual({
      value: "previous month",
      suffix: "ious month",
      sourceId: "user",
    });
  });
});

describe("serialization", () => {
  test("round trips form and JSON values", () => {
    const value = calchemy.fromFormValue("2026-12-25/2027-07-01");
    const json = calchemy.toJSON(value);

    expect(json).toEqual({ kind: "range", start: "2026-12-25", end: "2027-07-01" });
    expect(isDateValueJSON(json, Temporal)).toBe(true);
    expect(calchemy.toFormValue(calchemy.fromJSON(json))).toBe("2026-12-25/2027-07-01");
  });
});
