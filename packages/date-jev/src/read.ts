import type { DateSlice } from "./core/parser/expression/types";
import type { RelativeExpressionSlice } from "./core/parser/slice/types";

const DayOptions = {
  today: "The current day",
  tomorrow: "The day after today",
  yesterday: "The day before today",
  weekday: "A named day of the week, such as Tuesday",
  none: "Some other day, or no day at all",
} as const;

// Numbered like date-core's weekday vocabulary: Monday 1 through Sunday 7.
const Weekdays = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
} as const;

const WeekdayOptions = {
  ...nullOptions(Weekdays),
  none: "The phrase names no day of the week",
};

type DayOption = keyof typeof DayOptions;
type WeekdayOption = keyof typeof WeekdayOptions;

export type DayAnswers = {
  day: { choice: DayOption };
  weekday: { choice: WeekdayOption };
};

// Example: `dayQuestions()` asks Jev which single day the phrase in `state.phrase` names.
export function dayQuestions() {
  return {
    day: {
      type: "choice",
      instructions: "Which day does `phrase` name?",
      criteria: DayOptions,
    },
    weekday: {
      type: "choice",
      instructions: "Which day of the week does `phrase` name?",
      criteria: WeekdayOptions,
    },
  } as const;
}

// Example: `treeFromAnswers({ day: { choice: "tomorrow" }, ... })` builds the tree date-core's resolver reads for `tomorrow`.
export function treeFromAnswers(answers: DayAnswers): DateSlice | null {
  const day = answers.day.choice;
  if (day === "none") {
    return null;
  }

  if (day === "weekday") {
    const weekday = answers.weekday.choice;
    if (weekday === "none") {
      return null;
    }

    // A bare weekday is the upcoming one, as in date-core.
    return relative({
      kind: "modifier",
      modifier: "upcoming",
      target: { kind: "weekday", weekday: Weekdays[weekday] },
    });
  }

  return relative({ kind: "bare", value: day });
}

function relative(expression: RelativeExpressionSlice): DateSlice {
  return {
    expression: { kind: "scope", boundary: { kind: "relative", expression } },
    exclusions: [],
    transforms: [],
  };
}

function nullOptions<T extends Record<string, unknown>>(record: T): { [K in keyof T]: null } {
  return Object.fromEntries(Object.keys(record).map((key) => [key, null])) as { [K in keyof T]: null };
}
