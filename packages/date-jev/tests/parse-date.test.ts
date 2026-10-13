import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { createJevParser, toJSON, type DateValueJSON, type ParseDateContext } from "../src";
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
    ["jul 1", { kind: "single", date: "2026-07-01" }],
    ["jan 5", { kind: "single", date: "2026-01-05" }], // this year, even though it has passed
    ["march 15 2020", { kind: "single", date: "2020-03-15" }],
    ["6 mar 27", { kind: "single", date: "2027-03-06" }], // a written 27 is the year nearest the reference date
    ["the 15th", { kind: "single", date: "2026-05-15" }], // the 15th of this month, even though it has passed
    ["april", { kind: "range", start: "2026-04-01", end: "2026-04-30" }], // = `this april`
    ["august 2020", { kind: "range", start: "2020-08-01", end: "2020-08-31" }],
    ["next month", { kind: "range", start: "2026-06-01", end: "2026-06-30" }],
    ["this week", { kind: "range", start: "2026-05-24", end: "2026-05-30" }],
    ["previous quarter", { kind: "range", start: "2026-01-01", end: "2026-03-31" }],
    ["next year", { kind: "range", start: "2027-01-01", end: "2027-12-31" }],
    ["last 90 days", { kind: "range", start: "2026-02-27", end: "2026-05-27" }],
    ["next 10 days", { kind: "range", start: "2026-05-27", end: "2026-06-05" }],
    ["within 2 weeks", { kind: "range", start: "2026-05-27", end: "2026-06-09" }], // = `next 2 weeks`
    // Two-ended ranges: each end is a pinned single day (`today`, `this friday` = the coming friday).
    ["today until friday", { kind: "range", start: "2026-05-27", end: "2026-05-29" }],
    ["tomorrow to next friday", { kind: "range", start: "2026-05-28", end: "2026-06-05" }],
    // A floating end counts forward from the start, decided by the user: the upcoming friday falls
    // before the upcoming monday, so the range ends on the friday after it.
    ["monday through friday", { kind: "range", start: "2026-06-01", end: "2026-06-05" }],
    ["dec 20 until jan 3", { kind: "range", start: "2026-12-20", end: "2027-01-03" }],
    ["aug 10-14", { kind: "range", start: "2026-08-10", end: "2026-08-14" }],
    // The 3rd before the 28th has no month of its own, so it counts forward from the start.
    ["dec 28-3", { kind: "range", start: "2026-12-28", end: "2027-01-03" }],
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
