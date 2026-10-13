import { describe, expect, test } from "vitest";
import { AnswerNames, readAnswers, treeFromAnswers, type DateAnswers } from "../src/read";

const unread = { choice: "none", confidence: 1 };

// Example: `answersFor("end_", { day: ... })` lays out one piece's answers under its prefix.
function answersFor(prefix: string, answers: Partial<DateAnswers>): Record<string, unknown> {
  return Object.fromEntries(AnswerNames.map((name) => [`${prefix}${name}`, answers[name] ?? unread]));
}

// Seam B: Jev's answers into a tree. Answers are written out here, not recorded, so the
// confidence rule is pinned without depending on the numbers a live model returns.
describe("treeFromAnswers", () => {
  test("a reading is as confident as the weakest answer it uses", () => {
    const answers: DateAnswers = {
      day: { choice: "weekday", confidence: 0.84 },
      weekday: { choice: "friday", confidence: 0.92 },
      month: { choice: "none", confidence: 1 },
      day_of_month: { choice: "none", confidence: 1 },
      modifier: { choice: "none", confidence: 0.76 },
      shift: { choice: "later", confidence: 0.96 },
      period: { choice: "none", confidence: 1 },
      period_modifier: { choice: "none", confidence: 1 },
      counted: { choice: "none", confidence: 1 },
      unit: { choice: "week", confidence: 0.88 },
      count: { choice: "1", confidence: 0.91 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(0.76);
  });

  test("answers a reading does not use leave its confidence alone", () => {
    // `tomorrow` has no weekday, calendar date, or period, so the low answers about those play no part.
    const answers: DateAnswers = {
      day: { choice: "tomorrow", confidence: 1 },
      weekday: { choice: "none", confidence: 1 },
      month: { choice: "none", confidence: 0.61 },
      day_of_month: { choice: "none", confidence: 0.58 },
      modifier: { choice: "none", confidence: 0.47 },
      shift: { choice: "none", confidence: 1 },
      period: { choice: "none", confidence: 1 },
      period_modifier: { choice: "none", confidence: 0.52 },
      counted: { choice: "none", confidence: 1 },
      unit: { choice: "none", confidence: 0.63 },
      count: { choice: "1", confidence: 0.55 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(1);
  });

  test("a count with no number is unreadable, not read as a period", () => {
    // `next few weeks`: Jev names no count, and also sees `next week` in it.
    const answers = answersFor("", {
      period: { choice: "week", confidence: 0.9 },
      period_modifier: { choice: "next", confidence: 1 },
      counted: { choice: "span_forward", confidence: 1 },
      unit: { choice: "week", confidence: 1 },
    });

    expect(readAnswers(answers, "next few weeks", false)).toEqual([]);
  });

  test("a start that names a later day than its end takes no month from it", () => {
    // `28-3 jan`: the 28th cannot be in January before the 3rd, and nothing else names its month.
    const date = { choice: "date", confidence: 1 } as const;
    const answers = {
      ...answersFor("", {}),
      ...answersFor("start_", { day: date, day_of_month: { choice: "28", confidence: 1 } }),
      ...answersFor("end_", {
        day: date,
        month: { choice: "january", confidence: 1 },
        day_of_month: { choice: "3", confidence: 1 },
      }),
      is_range: { type: "noul", noul: 0.9 },
    };

    expect(readAnswers(answers, "28-3 jan", true)).toEqual([]);
  });

  test("a range whose end cannot be read is unreadable, not read whole", () => {
    // The whole phrase reads as `today`, but Jev says it is a range and its end names nothing.
    const today = { day: { choice: "today", confidence: 1 } } as const;
    const answers = {
      ...answersFor("", today),
      ...answersFor("start_", today),
      ...answersFor("end_", {}),
      is_range: { type: "noul", noul: 0.95 },
    };

    expect(readAnswers(answers, "today until friday", true)).toEqual([]);
  });
});
