import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { createJevParser, toJSON, type CreateJevParserOptions, type DateValueJSON, type ParseDateContext } from "../src";
import { AnswerNames } from "../src/read";
import { replayClient, unusedClient } from "./support/replay";

// Expected values come from date-core's pinned corpus (`packages/date-core/tests/parser.test.ts`),
// which uses this same reference date and context. Never take them from running date-jev.
const context: ParseDateContext = {
  referenceDate: Temporal.PlainDate.from("2026-05-27"),
  locale: "en-US",
  weekStartsOn: 0,
  dateOrderPreference: ["DMY", "MDY", "YMD"],
};

describe("parseDate", () => {
  test.each<[string, DateValueJSON]>([
    ["tomorrow", { kind: "single", date: "2026-05-28" }],
    ["tuesday", { kind: "single", date: "2026-06-02" }], // = `upcoming tuesday`
    ["this friday", { kind: "single", date: "2026-05-29" }],
    ["next friday", { kind: "single", date: "2026-06-05" }],
    ["last friday", { kind: "single", date: "2026-05-22" }],
    ["a week on friday", { kind: "single", date: "2026-06-05" }], // this friday plus a week, decided by the user
    ["day after tomorrow", { kind: "single", date: "2026-05-29" }],
    ["day before yesterday", { kind: "single", date: "2026-05-25" }],
    ["two weeks after tomorrow", { kind: "single", date: "2026-06-11" }],
    ["25 days from tomorrow", { kind: "single", date: "2026-06-22" }], // one day, decided by the user
    ["the day after friday", { kind: "single", date: "2026-05-30" }], // this friday plus a day, like `a week on friday`
    ["jul 1", { kind: "single", date: "2026-07-01" }],
    ["jan 5", { kind: "single", date: "2026-01-05" }], // this year, even though it has passed
    ["march 15 2020", { kind: "single", date: "2020-03-15" }],
    ["6 mar 27", { kind: "single", date: "2027-03-06" }], // a written 27 is the year nearest the reference date
    ["the 15th", { kind: "single", date: "2026-05-15" }], // the 15th of this month, even though it has passed
    ["feb 30", { kind: "range", start: "2030-02-01", end: "2030-02-28" }], // no February 30th, so 30 is the year, decided by the user
    ["june 27th", { kind: "single", date: "2026-06-27" }], // an ordinal always names a day, decided by the user
    ["april", { kind: "range", start: "2026-04-01", end: "2026-04-30" }], // = `this april`
    ["august 2020", { kind: "range", start: "2020-08-01", end: "2020-08-31" }],
    ["next april", { kind: "range", start: "2027-04-01", end: "2027-04-30" }], // = `april next year`
    ["next june", { kind: "range", start: "2026-06-01", end: "2026-06-30" }], // the upcoming June
    ["last june", { kind: "range", start: "2025-06-01", end: "2025-06-30" }], // = `june last year`
    ["next month", { kind: "range", start: "2026-06-01", end: "2026-06-30" }],
    ["this week", { kind: "range", start: "2026-05-24", end: "2026-05-30" }],
    ["previous quarter", { kind: "range", start: "2026-01-01", end: "2026-03-31" }],
    ["next year", { kind: "range", start: "2027-01-01", end: "2027-12-31" }],
    ["last 90 days", { kind: "range", start: "2026-02-27", end: "2026-05-27" }],
    ["next 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["within 2 weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }], // = `next 2 weeks`
    ["in 10 days", { kind: "single", date: "2026-06-06" }], // = `10 days from now`
    ["2 months ago", { kind: "single", date: "2026-03-27" }], // = `2 months before today`
    ["next two weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }], // = `next 2 weeks`
    ["three weeks from now", { kind: "single", date: "2026-06-17" }],
    ["in a week", { kind: "single", date: "2026-06-03" }], // = `in 1 week`
    ["in a fortnight", { kind: "single", date: "2026-06-10" }], // = `2 weeks from now`
    ["3 quarters from now", { kind: "single", date: "2027-02-27" }],
    // An ordinal names a whole period, as in date-core's pinned rows; a count names one day.
    ["ninth week from today", { kind: "range", start: "2026-07-26", end: "2026-08-01" }],
    ["third quarter from today", { kind: "range", start: "2027-01-01", end: "2027-03-31" }],
    // `to` starts a purpose here, not a range end, so Jev says it isn't a range and date-jev asks again about the whole phrase.
    ["can we meet next friday to talk it over?", { kind: "single", date: "2026-06-05" }], // = `next friday`
    // Two-ended ranges: each end is a pinned single day (`today`, `this friday` = the coming friday).
    ["today until friday", { kind: "range", start: "2026-05-27", end: "2026-05-29" }],
    ["tomorrow to next friday", { kind: "range", start: "2026-05-28", end: "2026-06-05" }],
    // A floating end counts forward from the start, decided by the user: the upcoming friday falls
    // before the upcoming monday, so the range ends on the friday after it.
    ["monday through friday", { kind: "range", start: "2026-06-01", end: "2026-06-05" }],
    ["dec 20 until jan 3", { kind: "range", start: "2026-12-20", end: "2027-01-03" }],
    ["tomorrow until march", { kind: "range", start: "2026-05-28", end: "2027-03-31" }],
    ["tomorrow until the 5th", { kind: "range", start: "2026-05-28", end: "2026-06-05" }],
    ["apr 1 until the 20th", { kind: "range", start: "2026-04-01", end: "2026-04-20" }], // the first 20th after the start
    ["this week until friday", { kind: "range", start: "2026-05-24", end: "2026-05-29" }], // starts at the week's beginning
    ["aug 10-14", { kind: "range", start: "2026-08-10", end: "2026-08-14" }],
    ["10-14 aug", { kind: "range", start: "2026-08-10", end: "2026-08-14" }], // = `aug 10-14`
    // The 3rd before the 28th has no month of its own, so it counts forward from the start.
    ["dec 28-3", { kind: "range", start: "2026-12-28", end: "2027-01-03" }],
    // An end that counts with no day of its own counts from the start, decided by the user; one
    // that names today counts from today.
    ["tomorrow until 15 days later", { kind: "range", start: "2026-05-28", end: "2026-06-12" }], // = `tomorrow until 15 days after tomorrow`
    ["tomorrow until 15 days from today", { kind: "range", start: "2026-05-28", end: "2026-06-11" }],
  ])("%s", async (input, expected) => {
    const jev = await createJevParser({ client: replayClient(input) });
    const result = await jev.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(toJSON(result.value)).toEqual(expected);
    }
  });

  // "the friday after next" is the friday after the coming one, decided by the user. On a
  // saturday the coming friday is already in next week, so it differs from "next friday".
  test("reads the friday after next from a saturday", async () => {
    const jev = await createJevParser({ client: replayClient("the friday after next") });
    const result = await jev.parseDate("the friday after next", {
      ...context,
      referenceDate: Temporal.PlainDate.from("2026-05-30"),
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(toJSON(result.value)).toEqual({ kind: "single", date: "2026-06-12" });
    }
  });

  // Decided by the user, as in date-core's pinned row: `june 27` could be the 27th or all of June 2027.
  test("reads june 27 as the day or the month of 2027", async () => {
    const jev = await createJevParser({ client: replayClient("june 27") });
    const result = await jev.parseDate("june 27", context);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((candidate) => [candidate.id, toJSON(candidate.value)])).toEqual([
        ["month-day", { kind: "single", date: "2026-06-27" }],
        ["month-year", { kind: "range", start: "2027-06-01", end: "2027-06-30" }],
      ]);
      const total = result.candidates.reduce((sum, candidate) => sum + candidate.confidence, 0);
      expect(result.confidence).toBeCloseTo(total);
    }
  });

  test("reports which model answered", async () => {
    const jev = await createJevParser({ client: replayClient("tomorrow") });
    const result = await jev.parseDate("tomorrow", context);

    expect(result.model).toBe("jev-1.13.0");
  });

  // Same error as date-core's pinned row for "" in `packages/date-core/tests/error-messages.test.ts`.
  test("answers empty input without asking Jev", async () => {
    const jev = await createJevParser({ client: unusedClient() });
    const result = await jev.parseDate("", context);

    expect(result).toEqual({
      status: "invalid",
      input: "",
      errors: [{ code: "empty-input", message: "Enter a date phrase." }],
    });
  });

  // date-core also returns `unsupported-expression` for this phrase (`tests/error-messages.test.ts`).
  test("explains a phrase it cannot read", async () => {
    const jev = await createJevParser({ client: replayClient("excluding holidays") });
    const result = await jev.parseDate("excluding holidays", context);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors).toEqual([
        { code: "unsupported-expression", message: 'Calchemy could not read "excluding holidays" as a date.' },
      ]);
    }
  });
});

type Answer = { choice: string; confidence: number };
type Request = { state: Record<string, string>; questions: Record<string, unknown> };

// Example: `scriptedClient([first, second])` answers date-jev's first call with `first` and its
// second with `second`, and keeps every request it was sent.
function scriptedClient(responses: ReadonlyArray<Record<string, unknown>>) {
  const requests: Request[] = [];
  const client = {
    async systemOne(request: Request) {
      requests.push(request);
      const answers = responses[requests.length - 1];
      if (!answers) {
        throw new Error(`date-jev made call ${requests.length}, but only ${responses.length} were expected`);
      }
      return { model: "jev-test", answers };
    },
  };
  return { client: client as unknown as CreateJevParserOptions["client"], requests };
}

// Example: `piece("end_", { day: friday })` answers every question about the end, with `none` for
// those not given.
function piece(prefix: string, answers: Partial<Record<(typeof AnswerNames)[number], Answer>>): Record<string, Answer> {
  return Object.fromEntries(AnswerNames.map((name) => [`${prefix}${name}`, answers[name] ?? { choice: "none", confidence: 1 }]));
}

const sure = (choice: string): Answer => ({ choice, confidence: 1 });
const noul = (value: number) => ({ type: "noul", noul: value });

// Seam A with answers written out instead of recorded: what date-jev asks, and what it builds from
// the answers, without depending on what a live model returns.
describe("asking Jev", () => {
  test("asks only about the two ends of a phrase that splits", async () => {
    const { client, requests } = scriptedClient([
      {
        ...piece("start_", { day: sure("today") }),
        ...piece("end_", { day: sure("weekday"), weekday: sure("friday") }),
        is_range: noul(0.95),
        end_from_start: noul(0.05),
      },
    ]);
    const result = await (await createJevParser({ client })).parseDate("today until friday", context);

    expect(result.status === "valid" && toJSON(result.value)).toEqual({ kind: "range", start: "2026-05-27", end: "2026-05-29" });
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]?.questions ?? {}).filter((name) => !/^(start_|end_|is_range$)/.test(name))).toEqual([]);
  });

  test("asks about the whole phrase when Jev says a split phrase is not a range", async () => {
    // `to` here starts a purpose, not the end of a range; the date is `next friday`.
    const input = "can we meet next friday to talk it over?";
    const { client, requests } = scriptedClient([
      { ...piece("start_", {}), ...piece("end_", {}), is_range: noul(0.1), end_from_start: noul(0.1) },
      piece("", { day: sure("weekday"), weekday: sure("friday"), modifier: sure("next") }),
    ]);
    const result = await (await createJevParser({ client })).parseDate(input, context);

    expect(result.status === "valid" && toJSON(result.value)).toEqual({ kind: "single", date: "2026-06-05" }); // = `next friday`
    expect(requests.map((request) => request.state)).toEqual([
      { phrase: input, start: "can we meet next friday", end: "talk it over?" },
      { phrase: input },
    ]);
  });

  // A range end that counts with no day of its own counts from the start, decided by the user:
  // `15 days later` is 15 days after tomorrow, as in `tomorrow until 15 days after tomorrow`.
  test("counts an end such as 15 days later from the start", async () => {
    const { client } = scriptedClient([
      {
        ...piece("start_", { day: sure("tomorrow") }),
        ...piece("end_", { shift: sure("later"), counted: sure("day_forward"), unit: sure("day"), count: sure("15") }),
        is_range: noul(0.95),
        end_from_start: noul(0.9),
      },
    ]);
    const result = await (await createJevParser({ client })).parseDate("tomorrow until 15 days later", context);

    expect(result.status === "valid" && toJSON(result.value)).toEqual({ kind: "range", start: "2026-05-28", end: "2026-06-12" });
  });

  // date-core's pinned rows: an ordinal names the whole period, unlike a count (`9 weeks from today` is one day).
  test.each<[string, string, string, DateValueJSON]>([
    ["ninth week from today", "week", "9", { kind: "range", start: "2026-07-26", end: "2026-08-01" }],
    ["twelfth month from today", "month", "12", { kind: "range", start: "2027-05-01", end: "2027-05-31" }],
    ["third quarter from today", "quarter", "3", { kind: "range", start: "2027-01-01", end: "2027-03-31" }],
    ["second year from today", "year", "2", { kind: "range", start: "2028-01-01", end: "2028-12-31" }],
  ])("reads %s as a whole period", async (input, unit, count, expected) => {
    const { client } = scriptedClient([piece("", { counted: sure("ordinal"), unit: sure(unit), count: sure(count) })]);
    const result = await (await createJevParser({ client })).parseDate(input, context);

    expect(result.status === "valid" && toJSON(result.value)).toEqual(expected);
  });
});
