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
  after_next: "The one after the coming one, as in `the friday after next`",
  last: "The one before, as in `last friday`",
  none: "No word picks which one, as in a bare `friday`",
} as const;

// A bare weekday is the upcoming one, as in date-core. `after_next` is the upcoming one plus a
// week, which differs from `next` on days when the upcoming one already falls in next week.
const Modifiers = {
  this: "this",
  next: "next",
  last: "last",
  none: "upcoming",
} as const satisfies Record<Exclude<ModifierOption, "after_next">, RelativeModifier>;

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

const PeriodOptions = {
  week: { what: "A whole calendar week", examples: ["this week", "next week", "last week"] },
  month: { what: "A whole calendar month", examples: ["this month", "next month", "last month"] },
  quarter: { what: "A quarter of the year", examples: ["this quarter", "next quarter", "last quarter"] },
  year: { what: "A whole calendar year", examples: ["this year", "next year", "last year"] },
  none: { what: "No whole period: a single day, or not a date", examples: ["tomorrow", "next friday", "banana"] },
};

const PeriodModifierOptions = {
  this: { what: "The current one", examples: ["this month", "this year"] },
  next: { what: "The following one", examples: ["next month", "next year"] },
  last: { what: "The one before", examples: ["last month", "previous year"] },
  none: { what: "No word picks which one", examples: ["month", "a year"] },
};

// date-core reads `last` and `previous` the same for whole periods.
const PeriodModifiers = {
  this: "this",
  next: "next",
  last: "last",
} as const satisfies Record<Exclude<PeriodModifierOption, "none">, RelativeModifier>;

type DayOption = keyof typeof DayOptions;
type WeekdayOption = keyof typeof WeekdayOptions;
type ModifierOption = keyof typeof ModifierOptions;
type ShiftOption = keyof typeof ShiftOptions;
type PeriodOption = keyof typeof PeriodOptions;
type PeriodModifierOption = keyof typeof PeriodModifierOptions;
type Answer = { confidence: number };

export type DateAnswers = {
  day: { choice: DayOption; confidence: number };
  weekday: { choice: WeekdayOption; confidence: number };
  modifier: { choice: ModifierOption; confidence: number };
  shift: { choice: ShiftOption; confidence: number };
  period: { choice: PeriodOption; confidence: number };
  period_modifier: { choice: PeriodModifierOption; confidence: number };
};

/** A text field of the state Jev reads: the whole phrase, or one end of a range. */
export type Field = "phrase" | "start" | "end";

// Example: `dateQuestions("start")` asks Jev which day or calendar period `state.start` names,
// under keys prefixed `start_`. The whole phrase keeps unprefixed keys.
export function dateQuestions(field: Field = "phrase") {
  const prefix = field === "phrase" ? "" : `${field}_`;
  return {
    [`${prefix}day`]: {
      type: "choice" as const,
      instructions: `Which day does \`${field}\` name?`,
      criteria: DayOptions,
    },
    [`${prefix}weekday`]: {
      type: "choice" as const,
      instructions: `Which day of the week does \`${field}\` name?`,
      criteria: WeekdayOptions,
    },
    [`${prefix}modifier`]: {
      type: "choice" as const,
      instructions: `Which word in \`${field}\` picks out which occurrence of the day of the week?`,
      criteria: ModifierOptions,
    },
    [`${prefix}shift`]: {
      type: "choice" as const,
      instructions: {
        question: `Does \`${field}\` shift its day by an extra amount, on top of the day it names?`,
        note: "Words that name a day by themselves are not a shift: today, tomorrow, yesterday, the day after tomorrow, the day before yesterday, a weekday, and a weekday with this, next, or last.",
      },
      criteria: ShiftOptions,
    },
    [`${prefix}period`]: {
      type: "choice" as const,
      instructions: `Which whole calendar period does \`${field}\` name?`,
      criteria: PeriodOptions,
    },
    [`${prefix}period_modifier`]: {
      type: "choice" as const,
      instructions: `Which word in \`${field}\` picks out which calendar period?`,
      criteria: PeriodModifierOptions,
    },
  };
}

// Example: `rangeQuestions()` asks about each end of a split phrase, and whether it is a range at all.
export function rangeQuestions() {
  return {
    ...dateQuestions("start"),
    ...dateQuestions("end"),
    is_range: {
      type: "noul" as const,
      instructions: "Does `phrase` name a stretch of days that runs from `start` to `end`?",
      criteria: {
        true: "A span with a start and an end, as in `today until friday`",
        false: "Not a span from `start` to `end`",
      },
    },
  };
}

/** A tree plus how sure Jev was: the weakest of the answers that built it. */
export type Reading = {
  slice: DateSlice;
  confidence: number;
};

// A split phrase that Jev confirms as a stretch of days reads as a range of its two ends. Without
// a split, or when Jev says it is not a range, the phrase reads whole.
export function readAnswers(answers: Readonly<Record<string, unknown>>, split: boolean): Reading | null {
  const isRange = split ? (answers.is_range as { noul: number }).noul : 0;
  return isRange >= 0.5
    ? rangeFromAnswers(answersFor(answers, "start"), answersFor(answers, "end"), isRange)
    : treeFromAnswers(answersFor(answers, "phrase"));
}

// The SDK cannot type answers under computed keys; each one is an answer to a question built
// from this module's own options.
function answersFor(answers: Readonly<Record<string, unknown>>, field: Field): DateAnswers {
  const prefix = field === "phrase" ? "" : `${field}_`;
  const names = ["day", "weekday", "modifier", "shift", "period", "period_modifier"] as const;
  return Object.fromEntries(names.map((name) => [name, answers[`${prefix}${name}`]])) as DateAnswers;
}

// Example: `treeFromAnswers({ day: { choice: "tomorrow", confidence: 1 }, ... })` reads `tomorrow` with confidence 1.
export function treeFromAnswers(answers: DateAnswers): Reading | null {
  const found = boundaryFromAnswers(answers);
  return found ? reading(found.boundary, found.used) : null;
}

// Example: `rangeFromAnswers(today, friday, 0.98)` reads `today until friday` from its two ends.
// The range is only as sure as Jev's answer that it is one, and as each end.
export function rangeFromAnswers(start: DateAnswers, end: DateAnswers, isRange: number): Reading | null {
  const from = boundaryFromAnswers(start);
  const to = boundaryFromAnswers(end);
  if (!from || !to) {
    return null;
  }

  return reading(
    {
      kind: "range",
      start: { kind: "boundary", boundary: from.boundary, side: "start" },
      end: { kind: "boundary", boundary: to.boundary, side: "end" },
    },
    [...from.used, ...to.used, { confidence: isRange }],
  );
}

// A piece is read as a day when Jev names one, and as a calendar period otherwise.
function boundaryFromAnswers(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const day = dayBoundary(answers);
  if (day) {
    const shift = answers.shift.choice;
    const boundary: BoundarySlice =
      shift === "none" ? day.boundary : { kind: "duration-near-boundary", ...Shifts[shift], anchor: day.boundary };
    return { boundary, used: [...day.used, answers.shift] };
  }

  return periodBoundary(answers);
}

function reading(boundary: BoundarySlice, used: readonly Answer[]): Reading {
  return {
    slice: { expression: boundaryToExpression(boundary), exclusions: [], transforms: [] },
    confidence: Math.min(...used.map((answer) => answer.confidence)),
  };
}

// Example: `periodBoundary(answers)` returns the `next month` boundary and the answers that chose it.
// A shift on a period is not something date-jev can read yet, so it makes the phrase unreadable
// rather than being dropped.
function periodBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const period = answers.period.choice;
  const modifier = answers.period_modifier.choice;
  if (answers.day.choice !== "none" || period === "none" || modifier === "none" || answers.shift.choice !== "none") {
    return null;
  }

  return {
    boundary: relative({
      kind: "modifier",
      modifier: PeriodModifiers[modifier],
      target: { kind: "calendar-unit", unit: period },
    }),
    used: [answers.day, answers.period, answers.period_modifier, answers.shift],
  };
}

// Example: `dayBoundary(answers)` returns the `upcoming friday` boundary and the answers that chose it.
// Only the answers a reading uses count toward its confidence: `tomorrow` ignores the modifier answer.
function dayBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const day = answers.day.choice;
  if (day === "none") {
    return null;
  }

  if (day === "weekday") {
    const weekday = answers.weekday.choice;
    if (weekday === "none") {
      return null;
    }

    const used = [answers.day, answers.weekday, answers.modifier];
    const target = { kind: "weekday", weekday: Weekdays[weekday] } as const;
    const modifier = answers.modifier.choice;
    if (modifier === "after_next") {
      const upcoming = relative({ kind: "modifier", modifier: "upcoming", target });
      return {
        boundary: { kind: "duration-near-boundary", amount: 1, unit: "week", direction: "after", anchor: upcoming },
        used,
      };
    }

    return { boundary: relative({ kind: "modifier", modifier: Modifiers[modifier], target }), used };
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
