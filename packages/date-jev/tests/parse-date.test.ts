import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { createJevParser, toJSON, type DateValueJSON, type ParseDateContext } from "../src";
import { replayClient } from "./support/replay";

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
  ])("%s", async (input, expected) => {
    const jev = await createJevParser({ client: replayClient(input) });
    const result = await jev.parseDate(input, context);

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(toJSON(result.value)).toEqual(expected);
    }
  });
});
