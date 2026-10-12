import { boundaryToExpression } from "./core/parser/expression/from-slice";
import type { DateSlice } from "./core/parser/expression/types";
import type { BoundarySlice, RelativeExpressionSlice } from "./core/parser/slice/types";
import type { DurationUnit, RelationDirection, RelativeDateValue, RelativeModifier } from "./core/parser/types";

const DayOptions = {
  today: "The current day",
  tomorrow: "The day after today",
  yesterday: "The day before today",
  day_after_tomorrow: "Two days after today, as in `the day after tomorrow`",
  day_before_yesterday: "Two days before today, as in `the day before yesterday`",
  weekday: "A named day of the week, such as Tuesday",
  none: "Some other day, or no day at all",
} as const;

// The two-day phrases are fixed expressions, so Jev names them as days; they become
// date-core's `day after tomorrow` and `day before yesterday` boundaries.
const TwoDayPhrases = {
  day_after_tomorrow: { amount: 1, unit: "day", direction: "after", from: "tomorrow" },
  day_before_yesterday: { amount: 1, unit: "day", direction: "before", from: "yesterday" },
} as const satisfies Record<
  string,
  { amount: number; unit: DurationUnit; direction: RelationDirection; from: RelativeDateValue }
>;

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

// Jev answers each question on its own, so the examples spell out that a day named directly,
// such as `tomorrow` or `next friday`, is not a shift.
const ShiftOptions = {
  none: {
    what: "No extra shift: the phrase names its day directly",
    examples: [
      "today",
      "tomorrow",
      "the day after tomorrow",
      "the day before yesterday",
      "friday",
      "next friday",
      "last friday",
    ],
  },
  day_later: { what: "One day after the day it names", examples: ["the day after friday", "the day after next monday"] },
  day_earlier: { what: "One day before the day it names", examples: ["the day before friday", "the day before next monday"] },
  week_later: { what: "One week after the day it names", examples: ["a week on friday", "a week from tuesday"] },
  week_earlier: { what: "One week before the day it names", examples: ["a week before friday"] },
};

// Each shift becomes date-core's `<amount> <unit> before/after <day>` boundary.
const Shifts = {
  day_later: { amount: 1, unit: "day", direction: "after" },
  day_earlier: { amount: 1, unit: "day", direction: "before" },
  week_later: { amount: 1, unit: "week", direction: "after" },
  week_earlier: { amount: 1, unit: "week", direction: "before" },
} as const satisfies Record<
  Exclude<ShiftOption, "none">,
  { amount: number; unit: DurationUnit; direction: RelationDirection }
>;

type DayOption = keyof typeof DayOptions;
type WeekdayOption = keyof typeof WeekdayOptions;
type ModifierOption = keyof typeof ModifierOptions;
type ShiftOption = keyof typeof ShiftOptions;
type Answer = { confidence: number };

export type DayAnswers = {
  day: { choice: DayOption; confidence: number };
  weekday: { choice: WeekdayOption; confidence: number };
  modifier: { choice: ModifierOption; confidence: number };
  shift: { choice: ShiftOption; confidence: number };
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
    shift: {
      type: "choice",
      instructions: {
        question: "Does `phrase` shift its day by an extra amount, on top of the day it names?",
        note: "Words that name a day by themselves are not a shift: today, tomorrow, yesterday, the day after tomorrow, the day before yesterday, a weekday, and a weekday with this, next, or last.",
      },
      criteria: ShiftOptions,
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
  const day = dayBoundary(answers);
  if (!day) {
    return null;
  }

  const shift = answers.shift.choice;
  const boundary: BoundarySlice =
    shift === "none" ? day.boundary : { kind: "duration-near-boundary", ...Shifts[shift], anchor: day.boundary };

  return {
    slice: { expression: boundaryToExpression(boundary), exclusions: [], transforms: [] },
    confidence: Math.min(...[...day.used, answers.shift].map((answer) => answer.confidence)),
  };
}

// Example: `dayBoundary(answers)` returns the `upcoming friday` boundary and the answers that chose it.
// Only the answers a reading uses count toward its confidence: `tomorrow` ignores the modifier answer.
function dayBoundary(answers: DayAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const day = answers.day.choice;
  if (day === "none") {
    return null;
  }

  if (day === "weekday") {
    const weekday = answers.weekday.choice;
    if (weekday === "none") {
      return null;
    }

    return {
      boundary: relative({
        kind: "modifier",
        modifier: Modifiers[answers.modifier.choice],
        target: { kind: "weekday", weekday: Weekdays[weekday] },
      }),
      used: [answers.day, answers.weekday, answers.modifier],
    };
  }

  if (day === "day_after_tomorrow" || day === "day_before_yesterday") {
    const { from, ...shift } = TwoDayPhrases[day];
    return {
      boundary: { kind: "duration-near-boundary", ...shift, anchor: relative({ kind: "bare", value: from }) },
      used: [answers.day],
    };
  }

  return { boundary: relative({ kind: "bare", value: day }), used: [answers.day] };
}

function relative(expression: RelativeExpressionSlice): BoundarySlice {
  return { kind: "relative", expression };
}

function nullOptions<T extends Record<string, unknown>>(record: T): { [K in keyof T]: null } {
  return Object.fromEntries(Object.keys(record).map((key) => [key, null])) as { [K in keyof T]: null };
}
