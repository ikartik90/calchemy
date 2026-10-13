import { boundaryToExpression } from "./core/parser/expression/from-slice";
import type { DateSlice } from "./core/parser/expression/types";
import type { BoundarySlice, RelativeExpressionSlice, YearReferenceSlice } from "./core/parser/slice/types";
import type { DurationUnit, RelationDirection, RelativeDateValue, RelativeModifier } from "./core/parser/types";
import type { RangeSplit } from "./split";

const DayOptions = {
  today: "The current day",
  tomorrow: "The day after today",
  yesterday: "The day before today",
  day_after_tomorrow: "Two days after today, as in `the day after tomorrow`",
  day_before_yesterday: "Two days before today, as in `the day before yesterday`",
  weekday: "A named day of the week, such as Tuesday",
  date: "A date on the calendar, named by its month and day, as in `june 5` or `5th nov`",
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

const Months = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
} as const;

const MonthOptions = {
  ...nullOptions(Months),
  none: "The phrase names no month",
};

// The day of the month as a Choice from 1 to 31, as in TypeSafe's date extraction cookbook.
const DayOfMonthOptions = {
  ...Object.fromEntries(Array.from({ length: 31 }, (_, index) => [String(index + 1), null])),
  none: "The phrase names no day of the month",
} as Record<`${number}` | "none", string | null>;

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

// A count of days, weeks, months, or years from today: a stretch, or one day that far away.
// The single-day shapes are listed so Jev can tell `in 10 days` from `next 10 days`; date-jev
// reads only the stretches so far.
const CountedOptions = {
  span_back: {
    what: "A number of days, weeks, months, or years counted back to today",
    examples: ["last 90 days", "past 2 weeks", "previous 3 months"],
  },
  span_forward: {
    what: "A number of days, weeks, months, or years counted forward from today",
    examples: ["next 10 days", "within 2 weeks", "upcoming 3 months"],
  },
  day_back: { what: "One day that many days, weeks, months, or years before today", examples: ["2 months ago", "3 days ago"] },
  day_forward: {
    what: "One day that many days, weeks, months, or years after today",
    examples: ["in 10 days", "3 weeks from now"],
  },
  none: { what: "No number of days, weeks, months, or years", examples: ["next week", "next month", "tomorrow", "friday", "june 5"] },
};

// date-core reads `last`, `past`, and `previous` alike for a count, and `next`, `upcoming`, and `future` alike.
const CountedModifiers = {
  span_back: "last",
  span_forward: "next",
} as const satisfies Partial<Record<CountedOption, RelativeModifier>>;

const UnitOptions = {
  day: { what: "Days", examples: ["last 90 days", "in 10 days"] },
  week: { what: "Weeks", examples: ["next 2 weeks", "3 weeks from now"] },
  month: { what: "Months", examples: ["last 3 months", "2 months ago"] },
  year: { what: "Years", examples: ["next 2 years"] },
  none: { what: "It counts nothing", examples: ["tomorrow", "next friday", "june 5"] },
};

type DayOption = keyof typeof DayOptions;
type WeekdayOption = keyof typeof WeekdayOptions;
type MonthOption = keyof typeof MonthOptions;
type DayOfMonthOption = keyof typeof DayOfMonthOptions;
type ModifierOption = keyof typeof ModifierOptions;
type ShiftOption = keyof typeof ShiftOptions;
type PeriodOption = keyof typeof PeriodOptions;
type PeriodModifierOption = keyof typeof PeriodModifierOptions;
type CountedOption = keyof typeof CountedOptions;
type UnitOption = keyof typeof UnitOptions;
type Answer = { confidence: number };

export type DateAnswers = {
  day: { choice: DayOption; confidence: number };
  weekday: { choice: WeekdayOption; confidence: number };
  month: { choice: MonthOption; confidence: number };
  day_of_month: { choice: DayOfMonthOption; confidence: number };
  /** One of the numbers written in the text, or `none`. Absent when the text has no numbers. */
  year?: { choice: string; confidence: number; probabilities?: Readonly<Record<string, number>> };
  modifier: { choice: ModifierOption; confidence: number };
  shift: { choice: ShiftOption; confidence: number };
  period: { choice: PeriodOption; confidence: number };
  period_modifier: { choice: PeriodModifierOption; confidence: number };
  counted: { choice: CountedOption; confidence: number };
  unit: { choice: UnitOption; confidence: number };
  /** One of the numbers written in the text, or `none`. Absent when the text has no numbers. */
  count?: { choice: string; confidence: number };
};

export const AnswerNames = [
  "day",
  "weekday",
  "month",
  "day_of_month",
  "year",
  "modifier",
  "shift",
  "period",
  "period_modifier",
  "counted",
  "unit",
  "count",
] as const satisfies ReadonlyArray<keyof DateAnswers>;

/** A text field of the state Jev reads: the whole phrase, or one end of a range. */
export type Field = "phrase" | "start" | "end";

// Example: `dateQuestions("start", "june 5 2027")` asks Jev which day or calendar period
// `state.start` names, under keys prefixed `start_`. The whole phrase keeps unprefixed keys.
export function dateQuestions(field: Field, text: string) {
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
    [`${prefix}month`]: {
      type: "choice" as const,
      instructions: `Which month does \`${field}\` name?`,
      criteria: MonthOptions,
    },
    [`${prefix}day_of_month`]: {
      type: "choice" as const,
      instructions: `Which day of the month does \`${field}\` name?`,
      criteria: DayOfMonthOptions,
    },
    ...numberQuestion(field, text, "year", {
      instructions: `Which of these numbers in \`${field}\` is the year?`,
      none: "None of them is a year",
    }),
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
    [`${prefix}counted`]: {
      type: "choice" as const,
      instructions: `Does \`${field}\` count a number of days, weeks, months, or years from today?`,
      criteria: CountedOptions,
    },
    [`${prefix}unit`]: {
      type: "choice" as const,
      instructions: `What does \`${field}\` count?`,
      criteria: UnitOptions,
    },
    ...numberQuestion(field, text, "count", {
      instructions: `Which of these numbers in \`${field}\` is the count of days, weeks, months, or years?`,
      none: "None of them is a count",
    }),
  };
}

// Example: `numberQuestion("phrase", "march 15 2020", "year", ...)` asks whether `15` or `2020` is the
// year. Code finds the numbers and Jev picks one, as TypeSafe's date extraction cookbook suggests, so
// a written `27` reaches date-core's math as written and becomes 2027 there. Text without numbers
// asks nothing.
function numberQuestion(
  field: Field,
  text: string,
  name: "year" | "count",
  { instructions, none }: { instructions: string; none: string },
) {
  const numbers = [...new Set(text.match(/\d+/g))];
  if (numbers.length === 0) {
    return {};
  }

  const prefix = field === "phrase" ? "" : `${field}_`;
  return {
    [`${prefix}${name}`]: {
      type: "choice" as const,
      instructions,
      criteria: { ...Object.fromEntries(numbers.map((number) => [number, null])), none },
    },
  };
}

// Example: `rangeQuestions(split)` asks about each end of a split phrase, and whether it is a range at all.
export function rangeQuestions(split: RangeSplit) {
  return {
    ...dateQuestions("start", split.start),
    ...dateQuestions("end", split.end),
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
  /** Set on each of several competing readings: its candidate id, and how strongly Jev leans to it. */
  alternative?: { id: string; weight: number };
};

// A split phrase that Jev confirms as a stretch of days reads as a range of its two ends. Without
// a split, or when Jev says it is not a range, the phrase reads whole, sometimes two ways at once.
// An empty list means date-jev cannot read the phrase.
export function readAnswers(answers: Readonly<Record<string, unknown>>, input: string, split: boolean): Reading[] {
  const isRange = split ? (answers.is_range as { noul: number }).noul : 0;
  if (isRange >= 0.5) {
    const range = rangeFromAnswers(answersFor(answers, "start"), answersFor(answers, "end"), isRange);
    return range ? [range] : [];
  }

  const whole = answersFor(answers, "phrase");
  const tree = treeFromAnswers(whole);
  return dayOrYearReadings(whole, input) ?? (tree ? [tree] : []);
}

// Example: `dayOrYearReadings(answers, "june 27")` returns June 27 this year and all of June 2027.
// A month followed by a two-digit number from 13 to 31 reads as either, as in date-core and decided
// by the user; the caller keeps whichever names a real date, so `feb 30` is February 2030. Jev's
// year answer says how strongly it leans to each. Its day answer plays no part: Jev doubts that
// `feb 30` names a day at all.
function dayOrYearReadings(answers: DateAnswers, input: string): Reading[] | null {
  const written = /\s(\d{2})$/.exec(input.trim())?.[1];
  const month = answers.month.choice;
  const dayOfMonth = answers.day_of_month.choice;
  const year = answers.year?.choice ?? "none";
  // The number must be the only day or year named: `6 mar 27` is March 6, 2027.
  const numberIsDayOrYear =
    (dayOfMonth === written && (year === "none" || year === written)) || (dayOfMonth === "none" && year === written);
  const twoDigitDay = Number(written) >= 13 && Number(written) <= 31;
  if (!written || !twoDigitDay || month === "none" || !numberIsDayOrYear || answers.shift.choice !== "none") {
    return null;
  }

  const used = [answers.month, answers.shift];
  const probabilities = answers.year?.probabilities ?? {};
  const range = { kind: "month-range", month: Months[month], year: { kind: "anchor" } } as const;
  return [
    {
      ...reading({ kind: "ordinal-day-in-range", day: Number(written), range }, used),
      alternative: { id: "month-day", weight: probabilities.none ?? 0 },
    },
    {
      ...reading({ ...range, year: { kind: "explicit", year: Number(written) } }, used),
      alternative: { id: "month-year", weight: probabilities[written] ?? 0 },
    },
  ];
}

// The SDK cannot type answers under computed keys; each one is an answer to a question built
// from this module's own options.
function answersFor(answers: Readonly<Record<string, unknown>>, field: Field): DateAnswers {
  const prefix = field === "phrase" ? "" : `${field}_`;
  return Object.fromEntries(AnswerNames.map((name) => [name, answers[`${prefix}${name}`]])) as DateAnswers;
}

// Example: `treeFromAnswers({ day: { choice: "tomorrow", confidence: 1 }, ... })` reads `tomorrow` with confidence 1.
export function treeFromAnswers(answers: DateAnswers): Reading | null {
  const found = boundaryFromAnswers(answers);
  return found ? reading(found.boundary, found.used) : null;
}

// Example: `rangeFromAnswers(today, friday, 0.98)` reads `today until friday` from its two ends.
// The range is only as sure as Jev's answer that it is one, and as each end.
export function rangeFromAnswers(start: DateAnswers, end: DateAnswers, isRange: number): Reading | null {
  const pieces = shareMonth(start, end);
  const from = pieces && boundaryFromAnswers(pieces.start);
  const to = pieces && boundaryFromAnswers(pieces.end);
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

// Example: in `aug 10-14` the end names only the 14th, so it takes August, and any year, from the
// start; in `10-14 aug` the start takes them from the end. An earlier end day keeps no month and
// counts forward from the start, so `dec 28-3` ends on January 3. A later start day, as in
// `28-3 jan`, has no month to take, so the range is unreadable. A piece with its own year, as in
// `aug 10-14 2027`, keeps no month and is unreadable.
function shareMonth(start: DateAnswers, end: DateAnswers): { start: DateAnswers; end: DateAnswers } | null {
  if (namesOnlyADay(end) && start.month.choice !== "none" && dayNumber(end) >= dayNumber(start)) {
    return { start, end: withMonthOf(end, start) };
  }

  if (namesOnlyADay(start) && end.month.choice !== "none") {
    return dayNumber(start) <= dayNumber(end) ? { start: withMonthOf(start, end), end } : null;
  }

  return { start, end };
}

// A piece such as `14` or `the 14th`: a day of the month with no month or year.
function namesOnlyADay(answers: DateAnswers): boolean {
  return (
    answers.day.choice === "date" &&
    answers.month.choice === "none" &&
    answers.day_of_month.choice !== "none" &&
    (answers.year?.choice ?? "none") === "none"
  );
}

// NaN when the piece names no day of the month, so every comparison with it is false.
function dayNumber(answers: DateAnswers): number {
  return Number(answers.day_of_month.choice);
}

function withMonthOf(piece: DateAnswers, other: DateAnswers): DateAnswers {
  const year = other.year?.choice === "none" ? undefined : other.year;
  return { ...piece, month: other.month, ...(year ? { year } : {}) };
}

// A piece is read as a day when Jev names one, then as a count from today, then as a named month,
// then as a calendar period.
// A count date-jev cannot read makes the piece unreadable rather than falling through: `next 2 weeks`
// must not read as `next week`.
function boundaryFromAnswers(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const day = dayBoundary(answers);
  if (day) {
    const shift = answers.shift.choice;
    const boundary: BoundarySlice =
      shift === "none" ? day.boundary : { kind: "duration-near-boundary", ...Shifts[shift], anchor: day.boundary };
    return { boundary, used: [...day.used, answers.shift] };
  }

  if (answers.counted.choice !== "none") {
    return countedBoundary(answers);
  }

  return monthBoundary(answers) ?? periodBoundary(answers);
}

// Example: `monthBoundary(answers)` returns `april` as the whole of April this year, `august 2020` as
// August 2020, and `next april` as date-core's relative month, the coming April after this one.
// date-core reads `this april` the same as `april`. Jev's day answer decides that no day is named:
// for `august 2020` it also offers the 20th of `2020` as a day of the month.
function monthBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const month = answers.month.choice;
  const modifier = answers.period_modifier.choice;
  if (month === "none" || answers.day.choice !== "none") {
    return null;
  }

  const year = answers.year;
  const used = [answers.day, answers.month, answers.period_modifier, ...(year ? [year] : [])];
  if (modifier === "none" || modifier === "this") {
    return { boundary: { kind: "month-range", month: Months[month], year: yearReference(year) }, used };
  }

  // `next april 2027` names its year twice; date-jev does not guess which one counts.
  return !year || year.choice === "none"
    ? { boundary: { kind: "relative-month", month: Months[month], modifier: PeriodModifiers[modifier] }, used }
    : null;
}

// Example: `countedBoundary(answers)` returns `last 90 days` as date-core's `last` with a count of 90 days.
function countedBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const counted = answers.counted.choice;
  const unit = answers.unit.choice;
  const count = answers.count;
  if ((counted !== "span_back" && counted !== "span_forward") || unit === "none" || !count || count.choice === "none") {
    return null;
  }

  return {
    boundary: relative({
      kind: "modifier",
      modifier: CountedModifiers[counted],
      target: { kind: "counted-duration", count: Number(count.choice), unit },
    }),
    used: [answers.day, answers.counted, answers.unit, count],
  };
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

  if (day === "date") {
    return calendarDateBoundary(answers);
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

// Example: `calendarDateBoundary(answers)` returns `jul 1` as day 1 of July this year, the tree
// date-core builds for `1st of july`. A written year stays as written; date-core's math expands `27`.
// Without a month, `the 15th` is the 15th of this month, as in date-core.
function calendarDateBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const month = answers.month.choice;
  const dayOfMonth = answers.day_of_month.choice;
  const year = answers.year;
  if (dayOfMonth === "none") {
    return null;
  }

  if (month === "none") {
    return !year || year.choice === "none"
      ? {
          boundary: { kind: "day-of-month", day: Number(dayOfMonth) },
          used: [answers.day, answers.month, answers.day_of_month, ...(year ? [year] : [])],
        }
      : null;
  }

  return {
    boundary: {
      kind: "ordinal-day-in-range",
      day: Number(dayOfMonth),
      range: { kind: "month-range", month: Months[month], year: yearReference(year) },
    },
    used: [answers.day, answers.month, answers.day_of_month, ...(year ? [year] : [])],
  };
}

// A written year stays as written, so date-core's math expands `27` to 2027; no year means this year.
function yearReference(year: DateAnswers["year"]): YearReferenceSlice {
  return !year || year.choice === "none" ? { kind: "anchor" } : { kind: "explicit", year: Number(year.choice) };
}

function relative(expression: RelativeExpressionSlice): BoundarySlice {
  return { kind: "relative", expression };
}

function nullOptions<T extends Record<string, unknown>>(record: T): { [K in keyof T]: null } {
  return Object.fromEntries(Object.keys(record).map((key) => [key, null])) as { [K in keyof T]: null };
}
