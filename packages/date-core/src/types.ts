import type { PlainDate, TemporalApi, ZonedDateTime } from "./temporal/types";
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
  anchor?: ZonedDateTime;
  locale?: string;
  weekStartsOn?: WeekdayIndex;
  dateOrderPreference?: DateOrder[];
  holidays?: HolidayProvider;
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
  shortcuts: readonly string[];
  month: number;
};

export type WeekdayVocabularyEntry = {
  value: string;
  shortcuts: readonly string[];
  weekday: number;
};

export type RelativeVocabularyEntry = {
  value: string;
  shortcuts?: readonly string[];
};

export type DurationUnitVocabularyEntry = {
  value: string;
  unit: DurationUnit;
  shortcuts?: readonly string[];
};

export type RecurrenceFrequencyVocabularyEntry = {
  value: string;
  cadence: RecurrenceCadence;
  shortcuts?: readonly string[];
};

export type NamedDatesVocabularyEntry = {
  value: string;
  shortcuts?: readonly string[];
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
    | "anchor"
    | "locale"
    | "weekStartsOn"
    | "dateOrderPreference"
    | "lastNDaysIncludesToday"
  >
> &
  Pick<ParseDateContext, "holidays">;

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
    | "invalid-date"
    | "invalid-context"
    | "unexpected-value-kind";
  message: string;
  token?: Token;
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
};

export type AmbiguousParseDateResult = {
  status: "ambiguous";
  input: string;
  candidates: Candidate[];
  ambiguityGroups: AmbiguityGroup[];
  corrections: Correction[];
};

export type InvalidParseDateResult = {
  status: "invalid";
  input: string;
  errors: ParseDateError[];
  corrections: Correction[];
};

export type InlineCompletion = {
  value: string;
  suffix: string;
  sourceId: string;
};

export type Calchemy = {
  Temporal: TemporalApi;
  parseDate(input: string, context?: ParseDateContext): ParseDateResult;
  toJSON(value: DateValue): DateValueJSON;
  fromJSON(value: unknown): DateValue;
  toFormValue(value: DateValue): string;
  fromFormValue(value: string): DateValue;
  getInlineCompletion(input: string): InlineCompletion | null;
};
