import { describe, expect, test } from "vitest";
import { treeFromAnswers, type DayAnswers } from "../src/read";

// Seam B: Jev's answers into a tree. Answers are written out here, not recorded, so the
// confidence rule is pinned without depending on the numbers a live model returns.
describe("treeFromAnswers", () => {
  test("a reading is as confident as the weakest answer it uses", () => {
    const answers: DayAnswers = {
      day: { choice: "weekday", confidence: 0.84 },
      weekday: { choice: "friday", confidence: 0.92 },
      modifier: { choice: "none", confidence: 0.76 },
      shift: { choice: "week_later", confidence: 0.96 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(0.76);
  });

  test("answers a reading does not use leave its confidence alone", () => {
    // `tomorrow` has no weekday, so the low modifier answer plays no part.
    const answers: DayAnswers = {
      day: { choice: "tomorrow", confidence: 1 },
      weekday: { choice: "none", confidence: 1 },
      modifier: { choice: "none", confidence: 0.47 },
      shift: { choice: "none", confidence: 1 },
    };

    expect(treeFromAnswers(answers)?.confidence).toBe(1);
  });
});
