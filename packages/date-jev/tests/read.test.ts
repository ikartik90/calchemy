import { describe, expect, test } from "vitest";
import { readAnswers, treeFromAnswers, type DateAnswers } from "../src/read";

const unread = { choice: "none", confidence: 1 };

// Example: `answersFor("end_", { day: ... })` lays out one piece's answers under its prefix.
function answersFor(prefix: string, answers: Partial<DateAnswers>): Record<string, unknown> {
  const names = ["day", "weekday", "modifier", "shift", "period", "period_modifier"] as const;
  return Object.fromEntries(names.map((name) => [`${prefix}${name}`, answers[name] ?? unread]));
}

// Seam B: Jev's answers into a tree. Answers are written out here, not recorded, so the
// confidence rule is pinned without depending on the numbers a live model returns.
describe("treeFromAnswers", () => {
  test("a reading is as confident as the weakest answer it uses", () => {
    const answers: DateAnswers = {
      day: { choice: "weekday", confidence: 0.84 },
      weekday: { choice: "friday", confidence: 0.92 },
      modifier: { choice: "none", confidence: 0.76 },
      shift: { choice: "week_later", confidence: 0.96 },
      period: { choice: "none", confidence: 1 },
      period_modifier: { choice: "none", confidence: 1 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(0.76);
  });

  test("answers a reading does not use leave its confidence alone", () => {
    // `tomorrow` has no weekday or period, so the low modifier answers play no part.
    const answers: DateAnswers = {
      day: { choice: "tomorrow", confidence: 1 },
      weekday: { choice: "none", confidence: 1 },
      modifier: { choice: "none", confidence: 0.47 },
      shift: { choice: "none", confidence: 1 },
      period: { choice: "none", confidence: 1 },
      period_modifier: { choice: "none", confidence: 0.52 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(1);
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

    expect(readAnswers(answers, true)).toBeNull();
  });
});
