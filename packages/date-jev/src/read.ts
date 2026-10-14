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

// Whether the phrase counts away from the day written in it. Jev answers each question on its own,
// so the examples spell out that a day written by itself, such as `tomorrow` or `next friday`, is
// not counted from. How far comes from the count and unit questions.
const ShiftOptions = {
  none: {
    what: "Nothing is counted from the day written",
    examples: ["today", "tomorrow", "the day after tomorrow", "friday", "next friday", "the friday after next", "june 5", "previous quarter"],
  },
  later: {
    what: "Some days, weeks, months, or years after the day written",
    examples: ["the day after friday", "a week on friday", "two weeks after tomorrow", "25 days from tomorrow", "10 days after june 5"],
  },
  earlier: {
    what: "Some days, weeks, months, or years before the day written",
    examples: ["the day before friday", "3 days before next friday", "a week before june 5"],
  },
};

// Each shift becomes date-core's `<amount> <unit> before/after <day>` boundary.
const ShiftDirections = {
  later: "after",
  earlier: "before",
} as const satisfies Record<Exclude<ShiftOption, "none">, RelationDirection>;

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

// A count of days, weeks, months, or years from today: a stretch, one day that far away, or the
// whole period that an ordinal names, so Jev can tell `in 10 days` from `next 10 days`, and
// `9 weeks from today` (one day) from `ninth week from today` (a whole week).
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
    examples: ["in 10 days", "3 weeks from now", "3 quarters from now"],
  },
  ordinal: {
    what: "The whole day, week, month, quarter, or year that an ordinal such as ninth or 3rd counts to from today",
    examples: ["ninth week from today", "third quarter from today", "2nd year from today"],
  },
  none: {
    what: "No count: a single day, or one whole calendar week, month, quarter, or year",
    examples: ["next week", "next month", "previous quarter", "this year", "tomorrow", "friday", "june 5"],
  },
};

// date-core reads `last`, `past`, and `previous` alike for a count, and `next`, `upcoming`, and `future` alike.
const CountedModifiers = {
  span_back: "last",
  span_forward: "next",
} as const satisfies Partial<Record<CountedOption, RelativeModifier>>;

const UnitOptions = {
  day: { what: "Days", examples: ["last 90 days", "in 10 days", "the day after friday"] },
  week: { what: "Weeks", examples: ["next 2 weeks", "3 weeks from now", "in a fortnight"] },
  month: { what: "Months", examples: ["last 3 months", "2 months ago"] },
  quarter: { what: "Quarters of a year", examples: ["3 quarters from now", "last 2 quarters"] },
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
  /** A number from 1 to 100, a larger number written in digits, or `none`. */
  count: { choice: string; confidence: number };
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
    // Each asks for the day as written: Jev reads, and code counts from it.
    [`${prefix}day`]: {
      type: "choice" as const,
      instructions: {
        question: `Which day is written in \`${field}\`?`,
        note: "Answer with the day as written, not a day counted from it: in `two weeks after tomorrow` it is tomorrow, and in `the day after friday` it is a weekday. `the day after tomorrow` and `the day before yesterday` are written days of their own.",
      },
      criteria: DayOptions,
    },
    [`${prefix}weekday`]: {
      type: "choice" as const,
      instructions: {
        question: `Which day of the week is written in \`${field}\`?`,
        note: "As written, not counted from: `the day after friday` and `3 days before next friday` are both friday.",
      },
      criteria: WeekdayOptions,
    },
    [`${prefix}month`]: {
      type: "choice" as const,
      instructions: {
        question: `Which month is written in \`${field}\`?`,
        note: "As written, not counted from: `a week after june 28` is june.",
      },
      criteria: MonthOptions,
    },
    [`${prefix}day_of_month`]: {
      type: "choice" as const,
      instructions: {
        question: `Which day of the month is written in \`${field}\`?`,
        note: "As written, not counted from: `10 days after june 5` is 5. A year is not a day of the month: `august 2020` names none.",
      },
      criteria: DayOfMonthOptions,
    },
    ...yearQuestion(field, text),
    [`${prefix}modifier`]: {
      type: "choice" as const,
      instructions: `Which word in \`${field}\` picks out which occurrence of the day of the week?`,
      criteria: ModifierOptions,
    },
    [`${prefix}shift`]: {
      type: "choice" as const,
      instructions: {
        question: `Does \`${field}\` count some days, weeks, months, or years after or before the day written in it?`,
        note: "A day written by itself is not counted from: today, tomorrow, yesterday, the day after tomorrow, the day before yesterday, a weekday, a weekday with this, next, last, or after next (as in `the friday after next`), a date such as june 5, and a whole week, month, quarter, or year (as in `previous quarter`).",
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
    [`${prefix}count`]: {
      type: "choice" as const,
      instructions: {
        question: `How many days, weeks, months, or years does \`${field}\` count?`,
        note: "Give the number the phrase says, before its unit, not a total in days: `two weeks` is 2, `a week` is 1, `the day after friday` is 1, `90 days` is 90, `ninth week` is 9, and `a fortnight` is 2 weeks.",
      },
      criteria: countOptions(text),
    },
  };
}

// Example: `yearQuestion("phrase", "march 15 2020")` asks whether `15` or `2020` is the year. Code
// finds the numbers and Jev picks one, as TypeSafe's date extraction cookbook suggests, so a written
// `27` reaches date-core's math as written and becomes 2027 there. Text without numbers asks nothing.
function yearQuestion(field: Field, text: string) {
  const numbers = writtenNumbers(text);
  if (numbers.length === 0) {
    return {};
  }

  const prefix = field === "phrase" ? "" : `${field}_`;
  return {
    [`${prefix}year`]: {
      type: "choice" as const,
      instructions: `Which of these numbers in \`${field}\` is the year?`,
      criteria: { ...Object.fromEntries(numbers.map((number) => [number, null])), none: "None of them is a year" },
    },
  };
}

// Example: `countOptions("last 365 days")` offers 1 to 100 and `365`. A Choice from 1 to 100, like the
// cookbook's day of the month, lets Jev read `two weeks` and `a week`; a larger count written in
// digits joins the list.
function countOptions(text: string): Record<string, string | null> {
  const numbers = new Set([...Array.from({ length: 100 }, (_, index) => String(index + 1)), ...writtenNumbers(text)]);
  return { ...Object.fromEntries([...numbers].map((number) => [number, null])), none: "It counts nothing" };
}

function writtenNumbers(text: string): string[] {
  return [...new Set(text.match(/\d+/g))];
}

// Example: `rangeQuestions(split)` asks about each end of a split phrase, whether it is a range at
// all, and whether its end counts from its start. The whole phrase is asked about only when Jev
// says it is not a range.
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
    // Jev answers the end questions the same for `15 days later` and `15 days from today`: no day
    // written, counted later. Only this says which day the count starts from.
    end_from_start: {
      type: "noul" as const,
      instructions: "Does `end` count from `start`, as in `15 days later` or `a week after that`?",
      criteria: {
        true: "It counts from `start`, as in `tomorrow until 15 days later`",
        false: "It names its own day, or counts from today, as in `friday`, `next month`, or `15 days from today`",
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

type Noul = { noul: number };

// Example: `readRangeAnswers(answers)` reads `today until friday` from its two ends. A split phrase
// that Jev confirms as a stretch of days reads as a range; null means Jev says it is not one, so
// the caller asks about the whole phrase. An empty list means a range date-jev cannot read.
export function readRangeAnswers(answers: Readonly<Record<string, unknown>>): Reading[] | null {
  const isRange = (answers.is_range as Noul).noul;
  if (isRange < 0.5) {
    return null;
  }

  const fromStart = answers.end_from_start as Noul;
  const range = rangeFromAnswers(answersFor(answers, "start"), answersFor(answers, "end"), isRange, fromStart.noul);
  return range ? [range] : [];
}

// Example: `readPhraseAnswers(answers, "next friday")` reads a phrase whole, sometimes two ways at
// once, as in `june 27`. An empty list means date-jev cannot read the phrase.
export function readPhraseAnswers(answers: Readonly<Record<string, unknown>>, input: string): Reading[] {
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

// Example: `rangeFromAnswers(today, friday, 0.98, 0.1)` reads `today until friday` from its two ends.
// The range is only as sure as Jev's answer that it is one, and as each end. When Jev says the end
// counts from the start, as in `15 days later`, it does: a floating end, decided by the user.
export function rangeFromAnswers(start: DateAnswers, end: DateAnswers, isRange: number, fromStart: number): Reading | null {
  const pieces = shareMonth(start, end);
  const from = pieces && boundaryFromAnswers(pieces.start);
  const to = pieces && from && (fromStart >= 0.5 ? countedFromStart(from.boundary, pieces.end, fromStart) : boundaryFromAnswers(pieces.end));
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

// Example: in `tomorrow until 15 days later`, `countedFromStart(tomorrow, end, 0.9)` returns date-core's
// `15 days after <tomorrow>`, the tree it builds for `15 days after tomorrow`.
function countedFromStart(
  start: BoundarySlice,
  end: DateAnswers,
  fromStart: number,
): { boundary: BoundarySlice; used: Answer[] } | null {
  const shift = end.shift.choice;
  const unit = end.unit.choice;
  const count = end.count.choice;
  if (shift === "none" || unit === "none" || count === "none") {
    return null;
  }

  return {
    boundary: { kind: "duration-near-boundary", amount: Number(count), unit, direction: ShiftDirections[shift], anchor: start },
    used: [{ confidence: fromStart }, end.shift, end.unit, end.count],
  };
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
    return shiftedBoundary(day, answers);
  }

  if (answers.counted.choice !== "none") {
    return countedBoundary(answers);
  }

  return monthBoundary(answers) ?? periodBoundary(answers);
}

// Example: `shiftedBoundary(friday, answers)` returns `two weeks after friday` as date-core's
// `2 weeks after <friday>`. A count date-jev cannot measure makes the phrase unreadable rather than
// dropping it.
function shiftedBoundary(
  day: { boundary: BoundarySlice; used: Answer[] },
  answers: DateAnswers,
): { boundary: BoundarySlice; used: Answer[] } | null {
  const shift = answers.shift.choice;
  if (shift === "none") {
    return { boundary: day.boundary, used: [...day.used, answers.shift] };
  }

  const unit = answers.unit.choice;
  const count = answers.count.choice;
  if (unit === "none" || count === "none") {
    return null;
  }

  return {
    boundary: {
      kind: "duration-near-boundary",
      amount: Number(count),
      unit,
      direction: ShiftDirections[shift],
      anchor: day.boundary,
    },
    used: [...day.used, answers.shift, answers.unit, answers.count],
  };
}

// Example: `monthBoundary(answers)` returns `april` as the whole of April this year, `august 2020` as
// August 2020, and `next april` as date-core's relative month, the coming April after this one.
// date-core reads `this april` the same as `april`. It is read only after no calendar date could
// be: Jev may call `august 2020` a date yet find no day of the month in it, or find the 20th of
// `2020` yet say no day is written.
function monthBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const month = answers.month.choice;
  const modifier = answers.period_modifier.choice;
  const day = answers.day.choice;
  if (month === "none" || (day !== "none" && day !== "date")) {
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

// Example: `countedBoundary(answers)` returns `last 90 days` as date-core's `last` with a count of
// 90 days, `in 10 days` as 10 days from now, `2 months ago` as 2 months before today, and
// `ninth week from today` as the ninth whole week from today: the trees date-core builds for each.
function countedBoundary(answers: DateAnswers): { boundary: BoundarySlice; used: Answer[] } | null {
  const counted = answers.counted.choice;
  const unit = answers.unit.choice;
  const count = answers.count;
  if (counted === "none" || unit === "none" || count.choice === "none") {
    return null;
  }

  const amount = Number(count.choice);
  const used = [answers.day, answers.counted, answers.unit, count];
  switch (counted) {
    case "span_back":
    case "span_forward":
      return {
        boundary: relative({
          kind: "modifier",
          modifier: CountedModifiers[counted],
          target: { kind: "counted-duration", count: amount, unit },
        }),
        used,
      };
    case "day_forward":
      return { boundary: relative({ kind: "from-now", amount, unit }), used };
    case "day_back":
      return {
        boundary: {
          kind: "duration-near-boundary",
          amount,
          unit,
          direction: "before",
          anchor: relative({ kind: "bare", value: "today" }),
        },
        used,
      };
    case "ordinal":
      return {
        boundary: { kind: "ordinal-unit-from-anchor", ordinal: amount, unit, anchor: relative({ kind: "bare", value: "today" }) },
        used,
      };
  }
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
