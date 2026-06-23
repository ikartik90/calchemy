import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { parseAmount, parseOrdinal } from "../src/parser/primitives/numbers";
import { createCalchemyWithTemporal, isDateValueJSON, resolveExpectedDateValue } from "../src";
import type { CompletionSource, DateValueJSON, NamedDatesVocabularyEntry, ParseDateContext } from "../src";

const referenceDate = Temporal.PlainDate.from("2026-05-27");
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
    value: "easter",
    aliases: [],
    resolveDate({ year }) {
      return getEasterDate(year);
    },
  },
  {
    value: "may holiday",
    isHoliday: true,
    resolveDate({ year, context }) {
      return context.referenceDate.with({ year, month: 5, day: 18 });
    },
  },
  {
    value: "june holiday",
    isHoliday: true,
    resolveDate({ year, context }) {
      return context.referenceDate.with({ year, month: 6, day: 6 });
    },
  },
] satisfies readonly NamedDatesVocabularyEntry[];
const calchemy = createCalchemyWithTemporal(Temporal, { namedDatesVocabulary });
const context: ParseDateContext = {
  referenceDate,
  locale: "en-US",
  weekStartsOn: 0,
  dateOrderPreference: ["DMY", "MDY", "YMD"],
};

describe("parseDate", () => {
  test("prefers referenceDate over timeZone when both are set", () => {
    const result = calchemy.parseDate("today", {
      referenceDate: Temporal.PlainDate.from("2026-01-15"),
      timeZone: "America/New_York",
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({ kind: "single", date: "2026-01-15" });
    }
  });

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
    ["today.", { kind: "single", date: "2026-05-27" }],
    ["tomorrow", { kind: "single", date: "2026-05-28" }],
    ["tomorrow, next month.", { kind: "single", date: "2026-06-28" }],
    ["three weeks from now", { kind: "single", date: "2026-06-17" }],
    ["3 quarters from now", { kind: "single", date: "2027-02-27" }],
    ["2 yrs from now", { kind: "single", date: "2028-05-27" }],
    ["first day of next month", { kind: "single", date: "2026-06-01" }],
    ["first day of the next month", { kind: "single", date: "2026-06-01" }],
    ["last day of next month", { kind: "single", date: "2026-06-30" }],
    ["third sunday of the next month", { kind: "single", date: "2026-06-21" }],
    ["third monday next quarter", { kind: "single", date: "2026-07-20" }],
    ["first monday from this monday", { kind: "single", date: "2026-06-01" }],
    ["third monday from this monday", { kind: "single", date: "2026-06-15" }],
    ["3rd monday from tomorrow", { kind: "single", date: "2026-06-15" }],
    ["three mondays from last monday until jun 25", { kind: "range", start: "2026-06-08", end: "2026-06-25" }],
    ["three mondays before last friday until jun 25", { kind: "range", start: "2026-05-04", end: "2026-06-25" }],
    ["tomorrow next month", { kind: "single", date: "2026-06-28" }],
    ["tomorrow next week", { kind: "single", date: "2026-06-04" }],
    ["tomorrow next quarter", { kind: "single", date: "2026-07-28" }],
    ["last 90 days", { kind: "range", start: "2026-02-27", end: "2026-05-27" }],
    ["past 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["previous 10 days", { kind: "range", start: "2026-05-18", end: "2026-05-27" }],
    ["upcoming 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["next 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["future 2 weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }],
    ["25 days from tomorrow", { kind: "range", start: "2026-05-28", end: "2026-06-22" }],
    ["three weeks from today until aug 15", { kind: "range", start: "2026-06-17", end: "2026-08-15" }],
    ["25 days from tomorrow until the end of june 27", { kind: "range", start: "2026-06-22", end: "2027-06-30" }],
    ["25 days from tomorrow till the end of june 27", { kind: "range", start: "2026-06-22", end: "2027-06-30" }],
    ["25 days from tomorrow up to the end of june 27", { kind: "range", start: "2026-06-22", end: "2027-06-30" }],
    ["25 days from tomorrow upto the end of june 27", { kind: "range", start: "2026-06-22", end: "2027-06-30" }],
    ["25 days from tomorrow to the end of june 27", { kind: "range", start: "2026-06-22", end: "2027-06-30" }],
    ["tomorrow until end of next month", { kind: "range", start: "2026-05-28", end: "2026-06-30" }],
    ["3rd quarter until the end of the year.", { kind: "range", start: "2026-07-01", end: "2026-12-31" }],
    ["ninth week from today", { kind: "range", start: "2026-07-26", end: "2026-08-01" }],
    ["9th week from today", { kind: "range", start: "2026-07-26", end: "2026-08-01" }],
    ["ninth week from tomorrow", { kind: "range", start: "2026-07-26", end: "2026-08-01" }],
    ["ninth week from christmas", { kind: "range", start: "2027-02-21", end: "2027-02-27" }],
    ["ninth week from easter", { kind: "range", start: "2026-06-07", end: "2026-06-13" }],
    ["ninth week from end of next month", { kind: "range", start: "2026-08-30", end: "2026-09-05" }],
    ["ninth week from 6 mar, 27", { kind: "range", start: "2027-05-02", end: "2027-05-08" }],
    ["twelfth month from today", { kind: "range", start: "2027-05-01", end: "2027-05-31" }],
    ["twelfth month from easter next year", { kind: "range", start: "2028-03-01", end: "2028-03-31" }],
    ["third quarter from today", { kind: "range", start: "2027-01-01", end: "2027-03-31" }],
    ["third quarter from christmas this year", { kind: "range", start: "2027-07-01", end: "2027-09-30" }],
    ["second year from today", { kind: "range", start: "2028-01-01", end: "2028-12-31" }],
    ["second year from jul 1, 27", { kind: "range", start: "2029-01-01", end: "2029-12-31" }],
    ["12 weeks from 6 mar, 27", { kind: "range", start: "2027-03-06", end: "2027-05-29" }],
    ["12 weeks from 6 mar, 27 until end of q3 27", { kind: "range", start: "2027-05-29", end: "2027-09-30" }],
    ["first 10 days of next month", { kind: "range", start: "2026-06-01", end: "2026-06-10" }],
    ["last 20 days of the next month", { kind: "range", start: "2026-06-11", end: "2026-06-30" }],
    ["first ten days in next year", { kind: "range", start: "2027-01-01", end: "2027-01-10" }],
    ["third weekend of the next month", { kind: "range", start: "2026-06-20", end: "2026-06-21" }],
    ["third week last quarter", { kind: "range", start: "2026-01-11", end: "2026-01-17" }],
    ["third week of last quarter", { kind: "range", start: "2026-01-11", end: "2026-01-17" }],
    ["51st and 52nd week this year", { kind: "range", start: "2026-12-13", end: "2026-12-26" }],
    ["between 50th and 52nd week this year", { kind: "range", start: "2026-12-06", end: "2026-12-26" }],
    ["Christmas 2026-Jul 1, 27", { kind: "range", start: "2026-12-25", end: "2027-07-01" }],
    ["2026-11-10/2026-11-24", { kind: "range", start: "2026-11-10", end: "2026-11-24" }],
    ["between christmas and jul 1 2027", { kind: "range", start: "2026-12-25", end: "2027-07-01" }],
    ["Q1", { kind: "range", start: "2026-01-01", end: "2026-03-31" }],
    ["q2", { kind: "range", start: "2026-04-01", end: "2026-06-30" }],
    ["Q3 2027", { kind: "range", start: "2027-07-01", end: "2027-09-30" }],
    ["Q4 next year", { kind: "range", start: "2027-10-01", end: "2027-12-31" }],
    ["3rd quarter", { kind: "range", start: "2026-07-01", end: "2026-09-30" }],
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
    ["june 27", { kind: "range", start: "2027-06-01", end: "2027-06-30" }],
    ["start of q3", { kind: "single", date: "2026-07-01" }],
    ["end of q3", { kind: "single", date: "2026-09-30" }],
    ["end of june 27", { kind: "single", date: "2027-06-30" }],
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
    ["day after tomorrow", { kind: "single", date: "2026-05-29" }],
    ["today and tomorrow", { kind: "multiple", dates: ["2026-05-27", "2026-05-28"] }],
    ["today & tomorrow", { kind: "multiple", dates: ["2026-05-27", "2026-05-28"] }],
    ["tomorrow and day after tomorrow", { kind: "multiple", dates: ["2026-05-28", "2026-05-29"] }],
    ["day before yesterday", { kind: "single", date: "2026-05-25" }],
    ["3 days before christmas this year", { kind: "single", date: "2026-12-22" }],
    ["two weeks after tomorrow", { kind: "single", date: "2026-06-11" }],
    ["2 days after next weekend", { kind: "single", date: "2026-06-09" }],
    ["2 days before next weekend", { kind: "single", date: "2026-06-04" }],
    ["the weekend before christmas", { kind: "range", start: "2026-12-19", end: "2026-12-20" }],
    ["The weekend before Christmas.", { kind: "range", start: "2026-12-19", end: "2026-12-20" }],
    ["the weekend after christmas", { kind: "range", start: "2026-12-26", end: "2026-12-27" }],
    ["jul 1", { kind: "single", date: "2026-07-01" }],
    ["jan 5", { kind: "single", date: "2026-01-05" }],
    ["aug 10-14", { kind: "range", start: "2026-08-10", end: "2026-08-14" }],
    ["week of aug 10", { kind: "range", start: "2026-08-09", end: "2026-08-15" }],
    ["6 mar, 27", { kind: "single", date: "2027-03-06" }],
    ["06 mar, 2027", { kind: "single", date: "2027-03-06" }],
    ["6 mar 27", { kind: "single", date: "2027-03-06" }],
    ["06 mar 2027", { kind: "single", date: "2027-03-06" }],
    ["mar 06, 2027", { kind: "single", date: "2027-03-06" }],
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

  test("keeps floating range endpoints invalid when they resolve before the start", () => {
    const result = calchemy.parseDate("12 weeks from tomorrow until the end of Q2", context);

    expect(result.status).toBe("invalid");
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

  test("keeps sampled ranges invalid when floating upper-bound endpoints resolve before the start", () => {
    const result = calchemy.parseDate("Every monday from tomorrow up to the end of march", context);

    expect(result.status).toBe("invalid");
  });

  test("selects weekdays from an explicit start through an explicit-year upper-bound endpoint", () => {
    const result = calchemy.parseDate("Every monday from tomorrow up to the end of march 27", context);

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
          "2026-08-31",
          "2026-09-07",
          "2026-09-14",
          "2026-09-21",
          "2026-09-28",
          "2026-10-05",
          "2026-10-12",
          "2026-10-19",
          "2026-10-26",
          "2026-11-02",
          "2026-11-09",
          "2026-11-16",
          "2026-11-23",
          "2026-11-30",
          "2026-12-07",
          "2026-12-14",
          "2026-12-21",
          "2026-12-28",
          "2027-01-04",
          "2027-01-11",
          "2027-01-18",
          "2027-01-25",
          "2027-02-01",
          "2027-02-08",
          "2027-02-15",
          "2027-02-22",
          "2027-03-01",
          "2027-03-08",
          "2027-03-15",
          "2027-03-22",
          "2027-03-29",
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

  test.each([
    ["all weekdays in q4"],
    ["all weekdays from q4"],
    ["every weekday in q4"],
    ["weekdays in q4"],
    ["weekdays from q4"],
  ])("selects day-group weekdays in a quarter range: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const dates = calchemy.toJSON(result.value);
      expect(dates.kind).toBe("multiple");
      if (dates.kind === "multiple") {
        expect(dates.dates[0]).toBe("2026-10-01");
        expect(dates.dates.at(-1)).toBe("2026-12-31");
        expect(dates.dates).toHaveLength(66);
        expect(dates.dates.every((date) => {
          const day = Temporal.PlainDate.from(date).dayOfWeek;
          return day >= 1 && day <= 5;
        })).toBe(true);
      }
    }
  });

  test.each([
    ["all weekends in q4"],
    ["all weekends from q4"],
    ["every weekend in q4"],
    ["weekends in q4"],
  ])("selects day-group weekends in a quarter range: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const dates = calchemy.toJSON(result.value);
      expect(dates.kind).toBe("multiple");
      if (dates.kind === "multiple") {
        expect(dates.dates[0]).toBe("2026-10-03");
        expect(dates.dates.at(-1)).toBe("2026-12-27");
        expect(dates.dates).toHaveLength(26);
        expect(dates.dates.every((date) => {
          const day = Temporal.PlainDate.from(date).dayOfWeek;
          return day === 6 || day === 7;
        })).toBe(true);
      }
    }
  });

  test("selects day-group weekdays between named month anchors", () => {
    const result = calchemy.parseDate("all weekdays between jan and mar", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const dates = calchemy.toJSON(result.value);
      expect(dates.kind).toBe("multiple");
      if (dates.kind === "multiple") {
        expect(dates.dates[0]).toBe("2026-01-01");
        expect(dates.dates.at(-1)).toBe("2026-03-31");
        expect(dates.dates).toHaveLength(64);
      }
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

  test("selects day-group weekdays in a relative month range", () => {
    const result = calchemy.parseDate("all weekday in next month", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const dates = calchemy.toJSON(result.value);
      expect(dates.kind).toBe("multiple");
      if (dates.kind === "multiple") {
        expect(dates.dates[0]).toBe("2026-06-01");
        expect(dates.dates.at(-1)).toBe("2026-06-30");
        expect(dates.dates).toHaveLength(22);
      }
    }
  });

  test.each([
    "monday and wednesday next month",
    "monday and wednesday in next month",
  ])("selects weekdays in a relative month range with or without an explicit preposition: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-06-01", "2026-06-03", "2026-06-08", "2026-06-10", "2026-06-15", "2026-06-17", "2026-06-22", "2026-06-24", "2026-06-29"],
      });
    }
  });

  test.each([
    "all weekdays in q4 excluding holidays",
    "all weekdays in q4 excl holidays",
  ])("selects day-group weekdays in a quarter range excluding holidays: %s", (input) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const dates = calchemy.toJSON(result.value);
      expect(dates.kind).toBe("multiple");
      if (dates.kind === "multiple") {
        expect(dates.dates).not.toContain("2026-12-25");
        expect(dates.dates).toHaveLength(65);
      }
    }
  });

  test("derives holiday exclusions from isHoliday named dates", () => {
    const holidayCalchemy = createCalchemyWithTemporal(Temporal, {
      namedDatesVocabulary: [
        {
          value: "christmas",
          aliases: ["xmas"],
          isHoliday: true,
          resolveDate({ year, context }) {
            return context.referenceDate.with({ year, month: 12, day: 25 });
          },
        },
      ],
    });
    const result = holidayCalchemy.parseDate("all weekdays in q4 excl holidays", {
      referenceDate,
      locale: "en-US",
      weekStartsOn: 0,
      dateOrderPreference: ["DMY", "MDY", "YMD"],
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(holidayCalchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: expect.not.arrayContaining(["2026-12-25"]),
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

  test("selects weekdays in the nth calendar week of a month", () => {
    const result = calchemy.parseDate("weekdays in the second week of july", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "range",
        start: "2026-07-06",
        end: "2026-07-10",
      });
    }
  });

  test("resolves weekday spans in an ordinal week as a range for range inputs", () => {
    const result = calchemy.parseDate("weekdays in the second week of july", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const rangeResult = resolveExpectedDateValue(result, "range");
      expect(rangeResult.status).toBe("valid");
      if (rangeResult.status === "valid") {
        expect(calchemy.toJSON(rangeResult.value)).toEqual({
          kind: "range",
          start: "2026-07-06",
          end: "2026-07-10",
        });
      }
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

  test("selects alternate weekdays on alternate weeks for a quarter range", () => {
    const result = calchemy.parseDate("Alternate mondays and wednesday in Q4", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-10-12",
          "2026-10-14",
          "2026-10-26",
          "2026-10-28",
          "2026-11-09",
          "2026-11-11",
          "2026-11-23",
          "2026-11-25",
          "2026-12-07",
          "2026-12-09",
          "2026-12-21",
          "2026-12-23",
        ],
      });
    }
  });

  test.each([
    ["odd mondays and wednesdays in Q4", [
      "2026-10-12",
      "2026-10-14",
      "2026-10-26",
      "2026-10-28",
      "2026-11-09",
      "2026-11-11",
      "2026-11-23",
      "2026-11-25",
      "2026-12-07",
      "2026-12-09",
      "2026-12-21",
      "2026-12-23",
    ]],
    ["even mondays and wednesdays in Q4", [
      "2026-10-05",
      "2026-10-07",
      "2026-10-19",
      "2026-10-21",
      "2026-11-02",
      "2026-11-04",
      "2026-11-16",
      "2026-11-18",
      "2026-11-30",
      "2026-12-02",
      "2026-12-14",
      "2026-12-16",
      "2026-12-28",
      "2026-12-30",
    ]],
  ])("selects parity weekdays on alternate weeks for a quarter range: %s", (input, dates) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates,
      });
    }
  });

  test.each([
    ["every alternate week in the next quarter"],
    ["every other week in the next quarter"],
  ])("selects alternate weeks for a relative quarter range: %s", (input) => {
    const result = calchemy.parseDate(input, {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-12",
          "2026-07-13",
          "2026-07-14",
          "2026-07-15",
          "2026-07-16",
          "2026-07-17",
          "2026-07-18",
          "2026-07-26",
          "2026-07-27",
          "2026-07-28",
          "2026-07-29",
          "2026-07-30",
          "2026-07-31",
          "2026-08-01",
          "2026-08-09",
          "2026-08-10",
          "2026-08-11",
          "2026-08-12",
          "2026-08-13",
          "2026-08-14",
          "2026-08-15",
          "2026-08-23",
          "2026-08-24",
          "2026-08-25",
          "2026-08-26",
          "2026-08-27",
          "2026-08-28",
          "2026-08-29",
          "2026-09-06",
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-20",
          "2026-09-21",
          "2026-09-22",
          "2026-09-23",
          "2026-09-24",
          "2026-09-25",
          "2026-09-26",
        ],
      });
    }
  });

  test("excludes an ordinal week range from alternate week sampling", () => {
    const result = calchemy.parseDate(
      "Every alternate week in the next quarter, except the third week of August.",
      {
        ...context,
        referenceDate: Temporal.PlainDate.from("2026-06-09"),
      },
    );

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-12",
          "2026-07-13",
          "2026-07-14",
          "2026-07-15",
          "2026-07-16",
          "2026-07-17",
          "2026-07-18",
          "2026-07-26",
          "2026-07-27",
          "2026-07-28",
          "2026-07-29",
          "2026-07-30",
          "2026-07-31",
          "2026-08-01",
          "2026-08-23",
          "2026-08-24",
          "2026-08-25",
          "2026-08-26",
          "2026-08-27",
          "2026-08-28",
          "2026-08-29",
          "2026-09-06",
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-20",
          "2026-09-21",
          "2026-09-22",
          "2026-09-23",
          "2026-09-24",
          "2026-09-25",
          "2026-09-26",
        ],
      });
    }
  });

  test("excludes overlapping calendar weeks from odd week sampling", () => {
    const result = calchemy.parseDate("Every odd week in the next quarter except the third week of August.", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-12",
          "2026-07-13",
          "2026-07-14",
          "2026-07-15",
          "2026-07-16",
          "2026-07-17",
          "2026-07-18",
          "2026-07-26",
          "2026-07-27",
          "2026-07-28",
          "2026-07-29",
          "2026-07-30",
          "2026-07-31",
          "2026-08-01",
          "2026-08-23",
          "2026-08-24",
          "2026-08-25",
          "2026-08-26",
          "2026-08-27",
          "2026-08-28",
          "2026-08-29",
          "2026-09-06",
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-20",
          "2026-09-21",
          "2026-09-22",
          "2026-09-23",
          "2026-09-24",
          "2026-09-25",
          "2026-09-26",
        ],
      });
    }
  });

  test("accepts parity-prefixed week sampling without an every command", () => {
    const result = calchemy.parseDate("Odd weeks in the next quarter except the third week of August.", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-12",
          "2026-07-13",
          "2026-07-14",
          "2026-07-15",
          "2026-07-16",
          "2026-07-17",
          "2026-07-18",
          "2026-07-26",
          "2026-07-27",
          "2026-07-28",
          "2026-07-29",
          "2026-07-30",
          "2026-07-31",
          "2026-08-01",
          "2026-08-23",
          "2026-08-24",
          "2026-08-25",
          "2026-08-26",
          "2026-08-27",
          "2026-08-28",
          "2026-08-29",
          "2026-09-06",
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-20",
          "2026-09-21",
          "2026-09-22",
          "2026-09-23",
          "2026-09-24",
          "2026-09-25",
          "2026-09-26",
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
          "2026-12-13",
          "2026-12-15",
          "2026-12-17",
          "2026-12-19",
          "2026-12-21",
          "2026-12-23",
          "2026-12-25",
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
        dates: ["2026-12-15", "2026-12-22"],
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

  test("selects even dates without requiring numbered", () => {
    const conciseResult = calchemy.parseDate("all even dates in december", context);
    const numberedResult = calchemy.parseDate("all even numbered dates in december", context);

    expect(conciseResult.status).toBe("valid");
    expect(numberedResult.status).toBe("valid");
    if (conciseResult.status === "valid" && numberedResult.status === "valid") {
      expect(calchemy.toJSON(conciseResult.value)).toEqual(calchemy.toJSON(numberedResult.value));
      expect(calchemy.toJSON(conciseResult.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-12-02",
          "2026-12-04",
          "2026-12-06",
          "2026-12-08",
          "2026-12-10",
          "2026-12-12",
          "2026-12-14",
          "2026-12-16",
          "2026-12-18",
          "2026-12-20",
          "2026-12-22",
          "2026-12-24",
          "2026-12-26",
          "2026-12-28",
          "2026-12-30",
        ],
      });
    }
  });

  test("selects even days from a start through an offset quarter endpoint", () => {
    const result = calchemy.parseDate("all even days from tomorrow until 10 days before end of q4", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const value = calchemy.toJSON(result.value);

      expect(value.kind).toBe("multiple");
      if (value.kind === "multiple") {
        expect(value.dates[0]).toBe("2026-05-28");
        expect(value.dates.at(-1)).toBe("2026-12-20");
        expect(value.dates.every((date) => Number(date.slice(-2)) % 2 === 0)).toBe(true);
      }
    }
  });

  test.each([
    "all mon and sat until end of next month",
    "all mon & sat until end of next month",
  ])("parses recurring weekdays until the end of next month: %s", (input) => {
    const result = calchemy.parseDate(input, context);

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

  test("parses recurring weekdays until the end of this year", () => {
    const result = calchemy.parseDate("mondays and wednesdays until the end of year", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-05-27",
          "2026-06-01",
          "2026-06-03",
          "2026-06-08",
          "2026-06-10",
          "2026-06-15",
          "2026-06-17",
          "2026-06-22",
          "2026-06-24",
          "2026-06-29",
          "2026-07-01",
          "2026-07-06",
          "2026-07-08",
          "2026-07-13",
          "2026-07-15",
          "2026-07-20",
          "2026-07-22",
          "2026-07-27",
          "2026-07-29",
          "2026-08-03",
          "2026-08-05",
          "2026-08-10",
          "2026-08-12",
          "2026-08-17",
          "2026-08-19",
          "2026-08-24",
          "2026-08-26",
          "2026-08-31",
          "2026-09-02",
          "2026-09-07",
          "2026-09-09",
          "2026-09-14",
          "2026-09-16",
          "2026-09-21",
          "2026-09-23",
          "2026-09-28",
          "2026-09-30",
          "2026-10-05",
          "2026-10-07",
          "2026-10-12",
          "2026-10-14",
          "2026-10-19",
          "2026-10-21",
          "2026-10-26",
          "2026-10-28",
          "2026-11-02",
          "2026-11-04",
          "2026-11-09",
          "2026-11-11",
          "2026-11-16",
          "2026-11-18",
          "2026-11-23",
          "2026-11-25",
          "2026-11-30",
          "2026-12-02",
          "2026-12-07",
          "2026-12-09",
          "2026-12-14",
          "2026-12-16",
          "2026-12-21",
          "2026-12-23",
          "2026-12-28",
          "2026-12-30",
        ],
      });
    }
  });

  test("parses recurring weekdays until a quarter duration endpoint", () => {
    const result = calchemy.parseDate("mondays and wednesdays until 3 quarters from now", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.corrections).not.toContainEqual(
        expect.objectContaining({ from: "quarters", to: "quarterly" }),
      );
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-05-27",
          "2026-06-01",
          "2026-06-03",
          "2026-06-08",
          "2026-06-10",
          "2026-06-15",
          "2026-06-17",
          "2026-06-22",
          "2026-06-24",
          "2026-06-29",
          "2026-07-01",
          "2026-07-06",
          "2026-07-08",
          "2026-07-13",
          "2026-07-15",
          "2026-07-20",
          "2026-07-22",
          "2026-07-27",
          "2026-07-29",
          "2026-08-03",
          "2026-08-05",
          "2026-08-10",
          "2026-08-12",
          "2026-08-17",
          "2026-08-19",
          "2026-08-24",
          "2026-08-26",
          "2026-08-31",
          "2026-09-02",
          "2026-09-07",
          "2026-09-09",
          "2026-09-14",
          "2026-09-16",
          "2026-09-21",
          "2026-09-23",
          "2026-09-28",
          "2026-09-30",
          "2026-10-05",
          "2026-10-07",
          "2026-10-12",
          "2026-10-14",
          "2026-10-19",
          "2026-10-21",
          "2026-10-26",
          "2026-10-28",
          "2026-11-02",
          "2026-11-04",
          "2026-11-09",
          "2026-11-11",
          "2026-11-16",
          "2026-11-18",
          "2026-11-23",
          "2026-11-25",
          "2026-11-30",
          "2026-12-02",
          "2026-12-07",
          "2026-12-09",
          "2026-12-14",
          "2026-12-16",
          "2026-12-21",
          "2026-12-23",
          "2026-12-28",
          "2026-12-30",
          "2027-01-04",
          "2027-01-06",
          "2027-01-11",
          "2027-01-13",
          "2027-01-18",
          "2027-01-20",
          "2027-01-25",
          "2027-01-27",
          "2027-02-01",
          "2027-02-03",
          "2027-02-08",
          "2027-02-10",
          "2027-02-15",
          "2027-02-17",
          "2027-02-22",
          "2027-02-24",
        ],
      });
    }
  });

  test("parses recurring weekdays until an implied weekday duration endpoint", () => {
    const result = calchemy.parseDate("mondays and wednesdays until 300 weekdays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      const json = calchemy.toJSON(result.value);
      expect(json.kind).toBe("multiple");
      if (json.kind === "multiple") {
        expect(json.dates).toHaveLength(121);
        expect(json.dates[0]).toBe("2026-05-27");
        expect(json.dates.at(-1)).toBe("2027-07-21");
      }
    }
  });

  test.each([
    "first 10 days of the next month excluding holidays",
    "first 10 days of the next month excl holidays",
  ])("returns discrete dates for range subsets excluding holidays: %s", (input) => {
    const result = calchemy.parseDate(input, context);

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
        dates: ["2027-12-20", "2027-12-21", "2027-12-22", "2027-12-23", "2027-12-24"],
      });
    }
  });

  test("returns weekdays for week ranges other than weekends", () => {
    const result = calchemy.parseDate("52nd week next year other than weekends", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2027-12-20", "2027-12-21", "2027-12-22", "2027-12-23", "2027-12-24"],
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
          "2027-12-13",
          "2027-12-14",
          "2027-12-15",
          "2027-12-16",
          "2027-12-17",
          "2027-12-20",
          "2027-12-21",
          "2027-12-22",
          "2027-12-23",
          "2027-12-24",
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
          "2026-12-14",
          "2026-12-15",
          "2026-12-16",
          "2026-12-17",
          "2026-12-18",
          "2026-12-21",
          "2026-12-22",
          "2026-12-23",
          "2026-12-24",
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

  test("returns configured holidays for the reference year", () => {
    const result = calchemy.parseDate("holidays", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-05-18", "2026-06-06", "2026-12-25"],
      });
    }
  });

  test("derives standalone holidays from isHoliday named dates", () => {
    const holidayCalchemy = createCalchemyWithTemporal(Temporal, {
      namedDatesVocabulary: [
        {
          value: "christmas",
          aliases: ["xmas"],
          isHoliday: true,
          resolveDate({ year, context }) {
            return context.referenceDate.with({ year, month: 12, day: 25 });
          },
        },
      ],
    });
    const result = holidayCalchemy.parseDate("holidays", {
      referenceDate,
      locale: "en-US",
      weekStartsOn: 0,
      dateOrderPreference: ["DMY", "MDY", "YMD"],
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(holidayCalchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-12-25"],
      });
    }
  });

  test("excludes a specific month-day date with an ordinal suffix from sampled weekday groups", () => {
    const result = calchemy.parseDate("all mondays in the next quarter except aug 10th", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-06",
          "2026-07-13",
          "2026-07-20",
          "2026-07-27",
          "2026-08-03",
          "2026-08-17",
          "2026-08-24",
          "2026-08-31",
          "2026-09-07",
          "2026-09-14",
          "2026-09-21",
          "2026-09-28",
        ],
      });
    }
  });

  test("excludes a specific month-day date from sampled weekday groups", () => {
    const result = calchemy.parseDate("all mondays in the next quarter except august 10", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-06",
          "2026-07-13",
          "2026-07-20",
          "2026-07-27",
          "2026-08-03",
          "2026-08-17",
          "2026-08-24",
          "2026-08-31",
          "2026-09-07",
          "2026-09-14",
          "2026-09-21",
          "2026-09-28",
        ],
      });
    }
  });

  test("excludes multiple month-day dates from sampled weekday groups", () => {
    const result = calchemy.parseDate("all mondays and fridays in q3 except aug 10, 14, and 17", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-03",
          "2026-07-06",
          "2026-07-10",
          "2026-07-13",
          "2026-07-17",
          "2026-07-20",
          "2026-07-24",
          "2026-07-27",
          "2026-07-31",
          "2026-08-03",
          "2026-08-07",
          "2026-08-21",
          "2026-08-24",
          "2026-08-28",
          "2026-08-31",
          "2026-09-04",
          "2026-09-07",
          "2026-09-11",
          "2026-09-14",
          "2026-09-18",
          "2026-09-21",
          "2026-09-25",
          "2026-09-28",
        ],
      });
    }
  });

  test("excludes sampled weekday groups parsed through the selection pipeline", () => {
    const result = calchemy.parseDate("all mondays and fridays in the next quarter excluding mondays in August", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-03",
          "2026-07-06",
          "2026-07-10",
          "2026-07-13",
          "2026-07-17",
          "2026-07-20",
          "2026-07-24",
          "2026-07-27",
          "2026-07-31",
          "2026-08-07",
          "2026-08-14",
          "2026-08-21",
          "2026-08-28",
          "2026-09-04",
          "2026-09-07",
          "2026-09-11",
          "2026-09-14",
          "2026-09-18",
          "2026-09-21",
          "2026-09-25",
          "2026-09-28",
        ],
      });
    }
  });

  test("excludes ordinal week ranges from sampled weekday groups", () => {
    const result = calchemy.parseDate("All mondays in Q3 except the second and third week of august", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: [
          "2026-07-06",
          "2026-07-13",
          "2026-07-20",
          "2026-07-27",
          "2026-08-17",
          "2026-08-24",
          "2026-08-31",
          "2026-09-07",
          "2026-09-14",
          "2026-09-21",
          "2026-09-28",
        ],
      });
    }
  });

  test("uses weekStartsOn when resolving week of date phrases", () => {
    const result = calchemy.parseDate("week of aug 10", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-06-09"),
      weekStartsOn: 1,
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "range",
        start: "2026-08-10",
        end: "2026-08-16",
      });
    }
  });

  test("returns multiple dates for month day lists", () => {
    const result = calchemy.parseDate("aug 10, 14, and 17", context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(calchemy.toJSON(result.value)).toEqual({
        kind: "multiple",
        dates: ["2026-08-10", "2026-08-14", "2026-08-17"],
      });
    }
  });

  test("returns ambiguity for month day shorthands that could be a past two-digit year", () => {
    const result = calchemy.parseDate("apr 15", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("month-day-year");
      expect(result.candidates.map((candidate) => calchemy.toJSON(candidate.value))).toEqual([
        { kind: "single", date: "2026-04-15" },
        { kind: "range", start: "2015-04-01", end: "2015-04-30" },
      ]);
    }
  });

  test("returns ambiguity for scoped sampler ranges with a past two-digit year shorthand", () => {
    const result = calchemy.parseDate("second tuesday from apr 15 until end of june", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("month-day-year");
      expect(result.candidates[0]?.id).toBe("nested-month-day");
      expect(calchemy.toJSON(result.candidates[0]?.value)).toEqual({
        kind: "range",
        start: "2026-04-28",
        end: "2026-06-30",
      });
      expect(result.candidates[1]?.id).toBe("nested-month-year");
      expect(calchemy.toJSON(result.candidates[1]?.value)).toEqual({
        kind: "range",
        start: "2015-04-14",
        end: "2026-06-30",
      });
    }
  });

  test("returns ambiguity for month day lists that could include a two-digit year", () => {
    const result = calchemy.parseDate("aug 10, 14", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("month-day-list");
      expect(result.candidates.map((candidate) => calchemy.toJSON(candidate.value))).toEqual([
        { kind: "single", date: "2014-08-10" },
        { kind: "multiple", dates: ["2026-08-10", "2026-08-14"] },
      ]);
    }
  });

  test.each([
    ["mar. 6, 27", { kind: "single", date: "2027-03-06" }, { kind: "multiple", dates: ["2026-03-06", "2026-03-27"] }],
    ["mar 6, 27", { kind: "single", date: "2027-03-06" }, { kind: "multiple", dates: ["2026-03-06", "2026-03-27"] }],
    ["mar 6 27", { kind: "single", date: "2027-03-06" }, { kind: "multiple", dates: ["2026-03-06", "2026-03-27"] }],
  ])("returns ambiguity for month-first day lists with a two-digit year: %s", (input, yearValue, listValue) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("month-day-list");
      expect(result.candidates.map((candidate) => calchemy.toJSON(candidate.value))).toEqual([yearValue, listValue]);
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

  test.each([
    [
      "12 weeks from 3/6/26",
      [
        { kind: "range", start: "2026-06-03", end: "2026-08-26" },
        { kind: "range", start: "2026-03-06", end: "2026-05-29" },
        { kind: "range", start: "2003-06-26", end: "2003-09-18" },
      ],
    ],
    [
      "from christmas to 7/1/2027",
      [
        { kind: "range", start: "2026-12-25", end: "2027-01-07" },
        { kind: "range", start: "2026-12-25", end: "2027-07-01" },
      ],
    ],
    [
      "select 3/6/26 to end of q3",
      [
        { kind: "range", start: "2026-06-03", end: "2026-09-30" },
        { kind: "range", start: "2026-03-06", end: "2026-09-30" },
        { kind: "range", start: "2003-06-26", end: "2026-09-30" },
      ],
    ],
  ])("returns ambiguity for nested numeric dates: %s", (input, expected) => {
    const result = calchemy.parseDate(input, context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("date-order");
      expect(result.candidates.map((candidate) => calchemy.toJSON(candidate.value))).toEqual(expected);
    }
  });

  test("returns ambiguity for sampled ranges with numeric until endpoints", () => {
    const result = calchemy.parseDate("every monday and thursday until 3/4/27", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("date-order");
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map((candidate) => candidate.id)).toEqual(["nested-dmy", "nested-mdy"]);
      expect(
        result.candidates.map((candidate) => {
          const value = calchemy.toJSON(candidate.value);
          return value.kind === "multiple" ? value.dates.at(-1) : null;
        }),
      ).toEqual(["2027-04-01", "2027-03-04"]);
    }
  });

  test("returns ambiguity for sampled ranges with demo date order preferences", () => {
    const demoCalchemy = createCalchemyWithTemporal(Temporal, {
      defaultContext: {
        referenceDate,
        locale: "en-US",
        weekStartsOn: 0,
        dateOrderPreference: ["MDY", "DMY"],
      },
    });
    const result = demoCalchemy.parseDate("every monday and thursday until 3/4/27");

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("date-order");
      expect(result.candidates.map((candidate) => candidate.id)).toEqual(["nested-mdy", "nested-dmy"]);
      expect(
        result.candidates.map((candidate) => {
          const value = demoCalchemy.toJSON(candidate.value);
          return value.kind === "multiple" ? value.dates.at(-1) : null;
        }),
      ).toEqual(["2027-03-04", "2027-04-01"]);
    }
  });

  test("returns ambiguity for scoped sampled ranges with numeric until endpoints", () => {
    const result = calchemy.parseDate("mondays and thursdays from 3rd quarter until 3/4/27", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.ambiguityGroups[0]?.kind).toBe("date-order");
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map((candidate) => candidate.id)).toEqual(["nested-dmy", "nested-mdy"]);
      expect(
        result.candidates.map((candidate) => {
          const value = calchemy.toJSON(candidate.value);
          return value.kind === "multiple" ? { first: value.dates.at(0), last: value.dates.at(-1) } : null;
        }),
      ).toEqual([
        { first: "2026-07-02", last: "2027-04-01" },
        { first: "2026-07-02", last: "2027-03-04" },
      ]);
    }
  });

  test("allows date order preference through parser initialization", () => {
    const ymdCalchemy = createCalchemyWithTemporal(Temporal, {
      defaultContext: {
        referenceDate,
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
    const fromAnchorResult = calchemy.parseDate("12 weeks from tomorrow", context);
    const singleResult = calchemy.parseDate("tomorrow", context);

    expect(rangeResult.status).toBe("valid");
    if (rangeResult.status === "valid") {
      const expectedSingleResult = resolveExpectedDateValue(rangeResult, "single");
      const multipleResult = resolveExpectedDateValue(rangeResult, "multiple");
      const cappedMultipleResult = resolveExpectedDateValue(rangeResult, "multiple", {
        multipleRangeExpansionLimit: 3,
      });

      expect(expectedSingleResult.status).toBe("invalid");
      if (expectedSingleResult.status === "invalid") {
        expect(expectedSingleResult.errors[0]?.code).toBe("unexpected-value-kind");
      }

      expect(multipleResult.status).toBe("valid");
      if (multipleResult.status === "valid") {
        const value = calchemy.toJSON(multipleResult.value);
        expect(value.kind).toBe("multiple");
        if (value.kind === "multiple") {
          expect(value.dates).toHaveLength(90);
          expect(value.dates.at(0)).toBe("2026-02-27");
          expect(value.dates.at(-1)).toBe("2026-05-27");
        }
        expect(multipleResult.warnings).toEqual([]);
      }

      expect(cappedMultipleResult.status).toBe("valid");
      if (cappedMultipleResult.status === "valid") {
        expect(calchemy.toJSON(cappedMultipleResult.value)).toEqual({
          kind: "multiple",
          dates: ["2026-02-27", "2026-02-28", "2026-03-01"],
        });
        expect(cappedMultipleResult.warnings).toEqual([
          {
            code: "maximum-selectable-dates-exceeded",
            message: "Exceeded maximum selectable dates. Showing the first 3 dates.",
            limit: 3,
            total: 90,
          },
        ]);
      }
    }

    expect(fromNowResult.status).toBe("valid");
    if (fromNowResult.status === "valid") {
      expect(calchemy.toJSON(fromNowResult.value)).toEqual({ kind: "single", date: "2026-08-19" });

      const rangeResult = resolveExpectedDateValue(fromNowResult, "range");
      expect(rangeResult.status).toBe("invalid");
      if (rangeResult.status === "invalid") {
        expect(rangeResult.errors[0]?.code).toBe("unexpected-value-kind");
      }
    }

    expect(fromAnchorResult.status).toBe("valid");
    if (fromAnchorResult.status === "valid") {
      expect(calchemy.toJSON(fromAnchorResult.value)).toEqual({
        kind: "range",
        start: "2026-05-28",
        end: "2026-08-20",
      });

      const expectedRangeResult = resolveExpectedDateValue(fromAnchorResult, "range");
      expect(expectedRangeResult.status).toBe("valid");
      if (expectedRangeResult.status === "valid") {
        expect(calchemy.toJSON(expectedRangeResult.value)).toEqual({
          kind: "range",
          start: "2026-05-28",
          end: "2026-08-20",
        });
      }

      const expectedSingleResult = resolveExpectedDateValue(fromAnchorResult, "single");
      expect(expectedSingleResult.status).toBe("valid");
      if (expectedSingleResult.status === "valid") {
        expect(calchemy.toJSON(expectedSingleResult.value)).toEqual({ kind: "single", date: "2026-08-20" });
      }
    }

    expect(singleResult.status).toBe("valid");
    if (singleResult.status === "valid") {
      const multipleResult = resolveExpectedDateValue(singleResult, "multiple");
      expect(multipleResult.status).toBe("valid");
      if (multipleResult.status === "valid") {
        expect(calchemy.toJSON(multipleResult.value)).toEqual({ kind: "multiple", dates: ["2026-05-28"] });
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

  test("reports the unsupported token span for unknown words", () => {
    const result = calchemy.parseDate("Foobar tomorrow", context);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors).toEqual([
        {
          code: "unsupported-expression",
          message: 'Calchemy does not understand "Foobar".',
          token: {
            kind: "word",
            raw: "Foobar",
            normalized: "foobar",
            start: 0,
            end: 6,
          },
        },
      ]);
    }
  });

  test("reports the unsupported token span when only part of the phrase is unknown", () => {
    const result = calchemy.parseDate("next qzxwv", context);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors[0]?.code).toBe("unsupported-expression");
      expect(result.errors[0]?.token).toEqual({
        kind: "word",
        raw: "qzxwv",
        normalized: "qzxwv",
        start: 5,
        end: 10,
      });
    }
  });

  test("reports the unsupported token span for unrecognized named dates", () => {
    const defaultCalchemy = createCalchemyWithTemporal(Temporal);
    const result = defaultCalchemy.parseDate("christmas", context);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors[0]?.token).toEqual({
        kind: "word",
        raw: "christmas",
        normalized: "christmas",
        start: 0,
        end: 9,
      });
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
    expect(completionCalchemy.getInlineCompletion("previous ")).toEqual({
      value: "previous 90 days",
      suffix: "90 days",
      sourceId: "user",
    });
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

  test("suggests an explicit next calendar cycle for invalid floating range endpoints", () => {
    const input = "12 weeks from tomorrow until the end of Q2";

    expect(calchemy.getInlineCompletion(input, context)).toEqual({
      value: "12 weeks from tomorrow until the end of Q2 2027",
      suffix: " 2027",
      sourceId: "calendar-cycle",
    });
    expect(calchemy.getInlineCompletion("Every monday from tomorrow up to the end of march", context)).toEqual({
      value: "Every monday from tomorrow up to the end of march 2027",
      suffix: " 2027",
      sourceId: "calendar-cycle",
    });
    expect(calchemy.getInlineCompletion("12 weeks from tomorrow until the end of Q2 2027", context)).toBeNull();
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
