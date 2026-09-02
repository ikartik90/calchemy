import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { createCalchemyWithTemporal } from "../src/temporal/create";
import type { InvalidParseDateResult, ParseDateResult } from "../src/types";

const calchemy = createCalchemyWithTemporal(Temporal, {
  defaultContext: {
    referenceDate: Temporal.PlainDate.from("2026-09-01"),
    locale: "en-US",
    weekStartsOn: 0,
    dateOrderPreference: ["DMY", "MDY", "YMD"],
  },
});

function expectInvalid(input: string): InvalidParseDateResult {
  const result: ParseDateResult = calchemy.parseDate(input);
  expect(result.status).toBe("invalid");
  if (result.status !== "invalid") {
    throw new Error(`expected an invalid result for ${input}`);
  }
  return result;
}

describe("impossible calendar dates", () => {
  test("reports a non-leap February 29 rather than an unsupported phrase", () => {
    const result = expectInvalid("29 feb 2027");
    const [error] = result.errors;

    expect(error?.code).toBe("impossible-date");
    expect(error?.message).toBe("2027 is not a leap year, so February 29 does not exist.");
    expect(error?.suggestions).toEqual(["2027-02-28", "2028-02-29"]);
  });

  test("suggests the last real day when the day overflows the month", () => {
    const result = expectInvalid("31 april 2027");
    const [error] = result.errors;

    expect(error?.code).toBe("impossible-date");
    expect(error?.message).toBe("April 2027 has 30 days, so April 31 does not exist.");
    expect(error?.suggestions).toEqual(["2027-04-30"]);
  });

  test("handles the month-first word order", () => {
    const result = expectInvalid("feb 30 2027");
    const [error] = result.errors;

    expect(error?.code).toBe("impossible-date");
    expect(error?.suggestions).toEqual(["2027-02-28"]);
  });

  test("falls back to the reference year when no year is given", () => {
    const result = expectInvalid("31 apr");
    const [error] = result.errors;

    expect(error?.code).toBe("impossible-date");
    expect(error?.message).toBe("April 2026 has 30 days, so April 31 does not exist.");
    expect(error?.suggestions).toEqual(["2026-04-30"]);
  });

  test("explains impossible ISO dates", () => {
    const result = expectInvalid("2027-02-29");
    const [error] = result.errors;

    expect(error?.code).toBe("impossible-date");
    expect(error?.suggestions).toEqual(["2027-02-28", "2028-02-29"]);
  });

  test("reports an out-of-range month in a numeric date", () => {
    const result = expectInvalid("13/45/2027");

    expect(result.errors[0]?.code).toBe("impossible-date");
  });

  test("points at the offending span in the original input", () => {
    const result = expectInvalid("29 feb 2027");
    const token = result.errors[0]?.token;

    expect(token?.raw).toBe("29 feb 2027");
    expect(token?.start).toBe(0);
    expect(token?.end).toBe(11);
  });

  test("leaves real dates alone", () => {
    for (const input of ["29 feb 2028", "feb 29 2028", "30 april 2027", "2028-02-29"]) {
      expect(calchemy.parseDate(input).status).toBe("valid");
    }
  });

  test("does not claim impossibility for phrases it simply does not know", () => {
    const result = expectInvalid("banana split");

    expect(result.errors[0]?.code).toBe("unsupported-expression");
  });

  test("does not hijack month phrases that carry no day", () => {
    for (const input of ["april 2027", "april", "next april", "last april"]) {
      expect(calchemy.parseDate(input).status).toBe("valid");
    }
  });
});

describe("named dates vocabulary validation", () => {
  const resolveDate = () => null;

  test("names the entry and field when value is missing", () => {
    expect(() =>
      createCalchemyWithTemporal(Temporal, {
        // @ts-expect-error deliberately malformed configuration
        namedDatesVocabulary: [{ aliases: ["xmas"], resolveDate }],
      }).parseDate("today"),
    ).toThrow(/namedDatesVocabulary\[0\]\.value must be a non-empty string, received undefined\./);
  });

  test("names the entry and field when resolveDate is missing", () => {
    expect(() =>
      createCalchemyWithTemporal(Temporal, {
        // @ts-expect-error deliberately malformed configuration
        namedDatesVocabulary: [{ value: "christmas" }],
      }).parseDate("today"),
    ).toThrow(/namedDatesVocabulary\[0\]\.resolveDate must be a function/);
  });

  test("rejects a non-string alias", () => {
    expect(() =>
      createCalchemyWithTemporal(Temporal, {
        // @ts-expect-error deliberately malformed configuration
        namedDatesVocabulary: [{ value: "christmas", aliases: [7], resolveDate }],
      }).parseDate("today"),
    ).toThrow(/namedDatesVocabulary\[0\]\.aliases\[0\] must be a non-empty string, received number\./);
  });

  test("accepts a well-formed entry", () => {
    const configured = createCalchemyWithTemporal(Temporal, {
      defaultContext: { referenceDate: Temporal.PlainDate.from("2026-09-01") },
      namedDatesVocabulary: [
        {
          value: "christmas",
          aliases: ["xmas"],
          isHoliday: true,
          resolveDate: ({ year, context }) => context.referenceDate.with({ year, month: 12, day: 25 }),
        },
      ],
    });

    expect(configured.parseDate("christmas").status).toBe("valid");
    expect(configured.parseDate("xmas").status).toBe("valid");
  });
});
