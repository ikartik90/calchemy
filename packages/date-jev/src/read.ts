import type { DateSlice } from "./core/parser/expression/types";

const DayOptions = {
  today: "The current day",
  tomorrow: "The day after today",
  yesterday: "The day before today",
  none: "Some other day, or no day at all",
} as const;

type DayOption = keyof typeof DayOptions;

export type DayAnswers = {
  day: { choice: DayOption };
};

// Example: `dayQuestions()` asks Jev which single day the phrase in `state.phrase` names.
export function dayQuestions() {
  return {
    day: {
      type: "choice",
      instructions: "Which day does `phrase` name?",
      criteria: DayOptions,
    },
  } as const;
}

// Example: `treeFromAnswers({ day: { choice: "tomorrow" } })` builds the tree date-core's resolver reads for `tomorrow`.
export function treeFromAnswers(answers: DayAnswers): DateSlice | null {
  const day = answers.day.choice;
  if (day === "none") {
    return null;
  }

  return {
    expression: { kind: "scope", boundary: { kind: "relative", expression: { kind: "bare", value: day } } },
    exclusions: [],
    transforms: [],
  };
}
