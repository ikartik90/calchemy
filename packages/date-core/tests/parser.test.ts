import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { parseAmount, parseOrdinal } from "../src/parser/primitives/numbers";
import { createCalchemyWithTemporal, isDateValueJSON, resolveExpectedDateValue } from "../src";
import type { CompletionSource, DateValueJSON, HolidayProvider, NamedDatesVocabularyEntry, ParseDateContext } from "../src";

const anchor = Temporal.ZonedDateTime.from("2026-05-27T12:00:00-04:00[America/New_York]");
const holidays: HolidayProvider = {
  id: "test",
  label: "Test holidays",
  includes(date) {
    return date.toString() === "2026-05-18" || date.toString() === "2026-06-06" || date.toString() === "2026-12-25";
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
    ["first day of next month", { kind: "single", date: "2026-06-01" }],
    ["first day of the next month", { kind: "single", date: "2026-06-01" }],
    ["last day of next month", { kind: "single", date: "2026-06-30" }],
    ["third sunday of the next month", { kind: "single", date: "2026-06-21" }],
    ["third monday next quarter", { kind: "single", date: "2026-07-20" }],
    ["tomorrow next month", { kind: "single", date: "2026-06-28" }],
    ["tomorrow next week", { kind: "single", date: "2026-06-04" }],
    ["tomorrow next quarter", { kind: "single", date: "2026-07-28" }],
    ["last 90 days", { kind: "range", start: "2026-02-27", end: "2026-05-27" }],
    ["past 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["previous 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["upcoming 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["next 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["future 2 weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }],
    ["12 weeks from 3/6/26", { kind: "range", start: "2026-06-03", end: "2026-08-26" }],
    ["12 weeks from 6 mar, 27", { kind: "range", start: "2027-03-06", end: "2027-05-29" }],
    ["first 10 days of next month", { kind: "range", start: "2026-06-01", end: "2026-06-10" }],
    ["last 20 days of the next month", { kind: "range", start: "2026-06-11", end: "2026-06-30" }],
    ["first ten days in next year", { kind: "range", start: "2027-01-01", end: "2027-01-10" }],
    ["third weekend of the next month", { kind: "range", start: "2026-06-20", end: "2026-06-21" }],
    ["third week last quarter", { kind: "range", start: "2026-01-15", end: "2026-01-21" }],
    ["third week of last quarter", { kind: "range", start: "2026-01-15", end: "2026-01-21" }],
    ["51st and 52nd week this year", { kind: "range", start: "2026-12-17", end: "2026-12-30" }],
    ["between 50th and 52nd week this year", { kind: "range", start: "2026-12-10", end: "2026-12-30" }],
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
    ["M3 22", { kind: "range", start: "2022-03-01", end: "2022-03-31" }],
    ["m12 next year", { kind: "range", start: "2027-12-01", end: "2027-12-31" }],
    ["W3 22", { kind: "range", start: "2022-01-17", end: "2022-01-23" }],
    ["w52 next year", { kind: "range", start: "2027-12-27", end: "2028-01-02" }],
    ["w48-w52", { kind: "range", start: "2026-11-23", end: "2026-12-27" }],
    ["m8-m12", { kind: "range", start: "2026-08-01", end: "2026-12-31" }],
    ["q1-q3", { kind: "range", start: "2026-01-01", end: "2026-09-30" }],
    ["Q3 27", { kind: "range", start: "2027-07-01", end: "2027-09-30" }],
    ["start of q3", { kind: "single", date: "2026-07-01" }],
    ["end of q3", { kind: "single", date: "2026-09-30" }],
    ["end of next quarter", { kind: "single", date: "2026-09-30" }],
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
    ["the thursday before next week's sunday", { kind: "single", date: "2026-05-28" }],
    ["the thursday before sunday of next week", { kind: "single", date: "2026-05-28" }],
    ["the thursday before next week's first sunday", { kind: "single", date: "2026-05-28" }],
    ["the thursday before next month's first sunday", { kind: "single", date: "2026-06-04" }],
    ["the thursday before next year’s first sunday", { kind: "single", date: "2026-12-31" }],
    ["the thursday before next years' first sunday", { kind: "single", date: "2026-12-31" }],
    ["the monday after next weekend", { kind: "single", date: "2026-06-08" }],
    ["the tuesday after next month's second weekend", { kind: "single", date: "2026-06-16" }],
    ["the tuesday after second weekend of next month", { kind: "single", date: "2026-06-16" }],
    ["jul 1", { kind: "single", date: "2026-07-01" }],
    ["jan 5", { kind: "single", date: "2026-01-05" }],
    ["6 mar, 27", { kind: "single", date: "2027-03-06" }],
    ["06 mar, 2027", { kind: "single", date: "2027-03-06" }],
    ["6 mar 27", { kind: "single", date: "2027-03-06" }],
    ["06 mar 2027", { kind: "single", date: "2027-03-06" }],
    ["mar 6, 27", { kind: "single", date: "2027-03-06" }],
    ["mar 06, 2027", { kind: "single", date: "2027-03-06" }],
    ["mar 6 27", { kind: "single", date: "2027-03-06" }],
    ["mar 06 2027", { kind: "single", date: "2027-03-06" }],
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
    ["this day", { kind: "single", date: "2026-05-27" }],
    ["next day", { kind: "single", date: "2026-05-28" }],
    ["last day", { kind: "single", date: "2026-05-26" }],
    ["previous day", { kind: "single", date: "2026-05-26" }],
  ] satisfies Array<[string, DateValueJSON]>)("parses relative weekday %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual(expected);
    }
  });

  test.each([
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

  test("samples even weekday occurrences across shorthand month boundaries and excludes holidays", () => {
    const result = calchemy.parseDate("even mondays from m3 to m5 excluding holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-03-09", "2026-03-23", "2026-04-06", "2026-04-20", "2026-05-04"],
      });
    }
  });

  test("selects weekdays in an ordinal week range and skips holidays", () => {
    const result = calchemy.parseDate("tuesday and friday of the 52nd week excluding holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-12-22"],
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

  test("selects alternate days for multiple ordinal week ranges", () => {
    const result = calchemy.parseDate("every other day of 51st and 52nd week this year", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-17",
          "2026-12-19",
          "2026-12-21",
          "2026-12-23",
          "2026-12-25",
          "2026-12-27",
          "2026-12-29",
        ],
      });
    }
  });

  test.each([
    ["every tuesdays of 51st and 52nd week this year"],
    ["all tuesdays of 51st and 52nd week this year"],
    ["tuesdays of 51st and 52nd week this year"],
  ])("selects weekdays for multiple ordinal week ranges: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-12-22", "2026-12-29"],
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

  test("returns discrete dates for range subsets excluding holidays", () => {
    const result = calchemy.parseDate("first 10 days of the next month excluding holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-06-01",
          "2026-06-02",
          "2026-06-03",
          "2026-06-04",
          "2026-06-05",
          "2026-06-07",
          "2026-06-08",
          "2026-06-09",
          "2026-06-10",
        ],
      });
    }
  });

  test("returns discrete dates for shorthand ranges excluding holidays", () => {
    const result = calchemy.parseDate("w52 26 excluding holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-26", "2026-12-27"],
      });
    }
  });

  test("returns weekdays for week ranges excluding weekends", () => {
    const result = calchemy.parseDate("52nd week next year excluding weekends", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2027-12-24", "2027-12-27", "2027-12-28", "2027-12-29", "2027-12-30"],
      });
    }
  });

  test("returns weekdays for multiple ordinal week ranges excluding weekends", () => {
    const result = calchemy.parseDate("51st and 52nd week next year excluding weekends", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2027-12-17",
          "2027-12-20",
          "2027-12-21",
          "2027-12-22",
          "2027-12-23",
          "2027-12-24",
          "2027-12-27",
          "2027-12-28",
          "2027-12-29",
          "2027-12-30",
        ],
      });
    }
  });

  test("returns weekdays for multiple ordinal week ranges excluding weekends and holidays", () => {
    const result = calchemy.parseDate("51st and 52nd week this year excluding weekends and holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-17",
          "2026-12-18",
          "2026-12-21",
          "2026-12-22",
          "2026-12-23",
          "2026-12-24",
          "2026-12-28",
          "2026-12-29",
          "2026-12-30",
        ],
      });
    }
  });

  test("returns weekdays for multiple shorthand week ranges excluding weekends", () => {
    const result = calchemy.parseDate("w51 and w52 next year excluding weekends", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2027-12-20",
          "2027-12-21",
          "2027-12-22",
          "2027-12-23",
          "2027-12-24",
          "2027-12-27",
          "2027-12-28",
          "2027-12-29",
          "2027-12-30",
          "2027-12-31",
        ],
      });
    }
  });

  test("composes shorthand month ranges with month exclusions", () => {
    const result = calchemy.parseDate("m3 and m4 next year excluding april", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2027-03-01",
          "2027-03-02",
          "2027-03-03",
          "2027-03-04",
          "2027-03-05",
          "2027-03-06",
          "2027-03-07",
          "2027-03-08",
          "2027-03-09",
          "2027-03-10",
          "2027-03-11",
          "2027-03-12",
          "2027-03-13",
          "2027-03-14",
          "2027-03-15",
          "2027-03-16",
          "2027-03-17",
          "2027-03-18",
          "2027-03-19",
          "2027-03-20",
          "2027-03-21",
          "2027-03-22",
          "2027-03-23",
          "2027-03-24",
          "2027-03-25",
          "2027-03-26",
          "2027-03-27",
          "2027-03-28",
          "2027-03-29",
          "2027-03-30",
          "2027-03-31",
        ],
      });
    }
  });

  test("composes ordinal month ranges with weekend exclusions", () => {
    const result = calchemy.parseDate("third and fourth month next year excluding weekends", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const value = calchemy.toJSON(result.value);
      expect(value.kind).toBe("multiple");
      if (value.kind === "multiple") {
        expect(value.dates[0]).toBe("2027-03-01");
        expect(value.dates.at(-1)).toBe("2027-04-30");
        expect(value.dates).not.toContain("2027-03-06");
        expect(value.dates).not.toContain("2027-04-25");
      }
    }
  });

  test("filters resolved ranges by year exclusions", () => {
    const result = calchemy.parseDate("christmas 2026-Jul 1, 27 excluding 2027", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-25",
          "2026-12-26",
          "2026-12-27",
          "2026-12-28",
          "2026-12-29",
          "2026-12-30",
          "2026-12-31",
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

  test("resolves expected value kind mismatches in core", () => {
    const rangeResult = calchemy.parseDate("last 90 days", context);
    const fromNowResult = calchemy.parseDate("12 weeks from now", context);

    expect(rangeResult.status).toBe("valid");
    if (rangeResult.status === "valid") {
      const singleResult = resolveExpectedDateValue(rangeResult, "single");
      const multipleResult = resolveExpectedDateValue(rangeResult, "multiple");

      expect(singleResult.status).toBe("valid");
      if (singleResult.status === "valid") {
        expect(calchemy.toJSON(singleResult.value)).toEqual({ kind: "single", date: "2026-02-27" });
      }

      expect(multipleResult.status).toBe("invalid");
      if (multipleResult.status === "invalid") {
        expect(multipleResult.errors[0]?.code).toBe("unexpected-value-kind");
      }
    }

    expect(fromNowResult.status).toBe("valid");
    if (fromNowResult.status === "valid") {
      expect(calchemy.toJSON(fromNowResult.value)).toEqual({ kind: "single", date: "2026-08-19" });

      const rangeResult = resolveExpectedDateValue(fromNowResult, "range");
      expect(rangeResult.status).toBe("valid");
      if (rangeResult.status === "valid") {
        expect(calchemy.toJSON(rangeResult.value)).toEqual({ kind: "range", start: "2026-05-27", end: "2026-08-19" });
      }
    }
  });

  test("tracks shorthand and typo corrections", () => {
    const result = calchemy.parseDate("tmrw", context);

    expect(result.status).toBe("valid");
    expect(result.corrections).toEqual([
      { from: "tmrw", to: "tomorrow", reason: "shorthand", confidence: 1 },
    ]);
  });

  test.each([
    "the thursday before next week's first sunday",
    "the thursday before next month's first sunday",
    "the thursday before next year’s first sunday",
    "the thursday before next years' first sunday",
  ])("does not report possessive calendar units as typo corrections: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    expect(result.corrections).toEqual([]);
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
    ["thirtieth", 30],
    ["fortieth", 40],
    ["fiftieth", 50],
    ["sixtieth", 60],
    ["seventieth", 70],
    ["eightieth", 80],
    ["ninetieth", 90],
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
    ["one hundred thirtieth", 130],
    ["two hundred fortieth", 240],
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
