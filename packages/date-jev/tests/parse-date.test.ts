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
  ])("%s", async (input, expected) => {
    const jev = await createJevParser({ client: replayClient(input) });
    const result = await jev.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(toJSON(result.value)).toEqual(expected);
    }
  });

  test("reports which model answered", async () => {
    const jev = await createJevParser({ client: replayClient("tomorrow") });
    const result = await jev.parseDate("tomorrow", context);

    expect(result.model).toBe("jev-1.13.0");
  });

  // Expected values are read off the recordings. "tomorrow" never uses its modifier answer
  // (0.49), so only its day (1) and shift (1) answers count; "a week on friday" uses day (0.84),
  // weekday (0.92), modifier (0.76), and shift (0.96).
  test.each([
    ["tomorrow", 1],
    ["a week on friday", 0.76],
  ])("%s is as confident as the weakest answer its reading uses", async (input, expected) => {
    const jev = await createJevParser({ client: replayClient(input) });
    const result = await jev.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.confidence).toBe(expected);
    }
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
