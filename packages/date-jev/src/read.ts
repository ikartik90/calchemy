import type { DateSlice } from "./core/parser/expression/types";
import type { RelativeExpressionSlice } from "./core/parser/slice/types";
import type { RelativeModifier } from "./core/parser/types";

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

const ModifierOptions = {
  this: "This week's, as in `this friday`",
  next: "The following one, as in `next friday`",
  last: "The one before, as in `last friday`",
  none: "No word picks which one, as in a bare `friday`",
} as const;

// A bare weekday is the upcoming one, as in date-core.
const Modifiers = {
  this: "this",
  next: "next",
  last: "last",
  none: "upcoming",
} as const satisfies Record<ModifierOption, RelativeModifier>;

type DayOption = keyof typeof DayOptions;
type WeekdayOption = keyof typeof WeekdayOptions;
type ModifierOption = keyof typeof ModifierOptions;

export type DayAnswers = {
  day: { choice: DayOption; confidence: number };
  weekday: { choice: WeekdayOption; confidence: number };
  modifier: { choice: ModifierOption; confidence: number };
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
    modifier: {
      type: "choice",
      instructions: "Which word in `phrase` picks out which occurrence of the day of the week?",
      criteria: ModifierOptions,
    },
  } as const;
}

/** A tree plus how sure Jev was: the weakest of the answers that built it. */
export type Reading = {
  slice: DateSlice;
  confidence: number;
};

// Example: `treeFromAnswers({ day: { choice: "tomorrow", confidence: 1 }, ... })` reads `tomorrow` with confidence 1.
export function treeFromAnswers(answers: DayAnswers): Reading | null {
  const day = answers.day.choice;
  if (day === "none") {
    return null;
  }

  if (day === "weekday") {
    const weekday = answers.weekday.choice;
    if (weekday === "none") {
      return null;
    }

    return relative(
      {
        kind: "modifier",
        modifier: Modifiers[answers.modifier.choice],
        target: { kind: "weekday", weekday: Weekdays[weekday] },
      },
      [answers.day, answers.weekday, answers.modifier],
    );
  }

  return relative({ kind: "bare", value: day }, [answers.day]);
}

// Only the answers a reading uses count toward its confidence: `tomorrow` ignores the modifier answer.
function relative(expression: RelativeExpressionSlice, used: readonly { confidence: number }[]): Reading {
  return {
    slice: {
      expression: { kind: "scope", boundary: { kind: "relative", expression } },
      exclusions: [],
      transforms: [],
    },
    confidence: Math.min(...used.map((answer) => answer.confidence)),
  };
}

function nullOptions<T extends Record<string, unknown>>(record: T): { [K in keyof T]: null } {
  return Object.fromEntries(Object.keys(record).map((key) => [key, null])) as { [K in keyof T]: null };
}
