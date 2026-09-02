import type { PlainDate, TemporalApi } from "./temporal/types";
import type { DurationUnit } from "./parser/types";

export type DateValue = SingleDateValue | DateRangeValue | MultipleDatesValue;

export type SingleDateValue = {
  kind: "single";
  date: PlainDate;
};

export type DateRangeValue = {
  kind: "range";
  start: PlainDate;
  end: PlainDate;
};

export type MultipleDatesValue = {
  kind: "multiple";
  dates: PlainDate[];
};

export type DateValueJSON =
  | { kind: "single"; date: string }
  | { kind: "range"; start: string; end: string }
  | { kind: "multiple"; dates: string[] };

export type ParseDateContext = {
  timeZone?: string;
  referenceDate?: PlainDate;
  locale?: string;
  weekStartsOn?: WeekdayIndex;
  dateOrderPreference?: readonly DateOrder[];
  lastNDaysIncludesToday?: boolean;
};

export type DurationAmount = {
  unit: DurationUnit;
  count: number;
};

export type RecurrenceCadence =
  | { kind: "interval"; every: DurationAmount }
  | { kind: "timesPer"; count: number; per: DurationUnit };

export type MonthVocabularyEntry = {
  value: string;
  aliases: readonly string[];
  month: number;
};

export type WeekdayVocabularyEntry = {
  value: string;
  aliases: readonly string[];
  weekday: number;
};

export type RelativeVocabularyEntry = {
  value: string;
  aliases?: readonly string[];
};

export type DurationUnitVocabularyEntry = {
  value: string;
  unit: DurationUnit;
};

export type RecurrenceFrequencyVocabularyEntry = {
  value: string;
  cadence: RecurrenceCadence;
  aliases?: readonly string[];
};

export type NamedDatesVocabularyEntry = {
  value: string;
  aliases?: readonly string[];
  isHoliday?: boolean;
  resolveDate(args: {
    year: number;
    context: ResolvedParseDateContext;
  }): PlainDate | null;
};

export type DateVocabulary = {
  months: readonly MonthVocabularyEntry[];
  weekdays: readonly WeekdayVocabularyEntry[];
  relatives: readonly RelativeVocabularyEntry[];
  durationUnits: readonly DurationUnitVocabularyEntry[];
  recurrenceFrequencies: readonly RecurrenceFrequencyVocabularyEntry[];
  namedDates?: readonly NamedDatesVocabularyEntry[];
};

export type CompletionSource = {
  id: string;
  entries: readonly CompletionEntry[];
};

export type CompletionEntry = {
  value: string;
};

export type ResolvedParseDateContext = Required<
  Pick<
    ParseDateContext,
    | "referenceDate"
    | "locale"
    | "weekStartsOn"
    | "dateOrderPreference"
    | "lastNDaysIncludesToday"
  >
> & {
  holidays?: HolidayProvider;
};

export type DateOrder = "MDY" | "DMY" | "YMD";
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HolidayProvider = {
  id: string;
  label: string;
  includes(date: PlainDate): boolean;
};

export type Correction = {
  from: string;
  to: string;
  reason: "typo" | "shorthand" | "alias";
  confidence: number;
};

export type Token = {
  kind: "word" | "number" | "separator";
  raw: string;
  normalized: string;
  start: number;
  end: number;
};

export type Candidate = {
  id: string;
  value: DateValue;
  confidence: number;
  label: string;
  explanation?: string;
  source: CandidateSource;
};

export type CandidateSource = {
  normalizedInput: string;
  tokens: Token[];
  corrections: Correction[];
};

export type AmbiguityGroup = {
  id: string;
  kind:
    | "date-order"
    | "two-digit-year"
    | "month-day-list"
    | "month-day-year"
    | "relative-anchor"
    | "range-boundary"
    | "holiday-calendar";
  message: string;
  options: AmbiguityOption[];
};

export type AmbiguityOption = {
  id: string;
  label: string;
  candidateIds: string[];
};

export type ParseDateError = {
  code:
    | "empty-input"
    | "unsupported-expression"
    | "impossible-date"
    | "invalid-date"
    | "invalid-context"
    | "unexpected-value-kind";
  message: string;
  token?: Token;
  /**
   * ISO `YYYY-MM-DD` dates the caller may offer as corrections. Only set when
   * the parser understood the phrase but the calendar date it names does not
   * exist, as in `29 feb 2027`.
   */
  suggestions?: string[];
};

export type ParseDateWarning = {
  code: "maximum-selectable-dates-exceeded";
  message: string;
  limit: number;
  total: number;
};

export type ParseDateResult =
  | ValidParseDateResult
  | AmbiguousParseDateResult
  | InvalidParseDateResult;

export type ValidParseDateResult = {
  status: "valid";
  input: string;
  value: DateValue;
  candidates: Candidate[];
  corrections: Correction[];
  warnings: ParseDateWarning[];
};

export type AmbiguousParseDateResult = {
  status: "ambiguous";
  input: string;
  candidates: Candidate[];
  ambiguityGroups: AmbiguityGroup[];
  corrections: Correction[];
  warnings: ParseDateWarning[];
};

export type InvalidParseDateResult = {
  status: "invalid";
  input: string;
  errors: ParseDateError[];
  corrections: Correction[];
  warnings: ParseDateWarning[];
};

export type InlineCompletion = {
  value: string;
  suffix: string;
  sourceId: string;
};

export type Calchemy = {
  Temporal: TemporalApi;
  namedDatesVocabulary: readonly NamedDatesVocabularyEntry[];
  parseDate(input: string, context?: ParseDateContext): ParseDateResult;
  toJSON(value: DateValue): DateValueJSON;
  fromJSON(value: unknown): DateValue;
  toFormValue(value: DateValue): string;
  fromFormValue(value: string): DateValue;
  getInlineCompletion(input: string, context?: ParseDateContext): InlineCompletion | null;
};
