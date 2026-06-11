import type {
  DateVocabulary,
  DurationUnitVocabularyEntry,
  MonthVocabularyEntry,
  RecurrenceFrequencyVocabularyEntry,
  RelativeVocabularyEntry,
  WeekdayVocabularyEntry,
} from "../types";

export const ArticleWords = ["a", "an", "the"] as const;

export const PeriodRecords = [
  {
    value: "day",
    aliases: ["date", "dates"],
    duration: true,
    calendarRange: false,
    calendarList: false,
    dayGroup: false,
  },
  {
    value: "week",
    aliases: ["wk", "wks"],
    duration: true,
    calendarRange: true,
    calendarList: true,
    dayGroup: false,
  },
  {
    value: "weekdays",
    aliases: ["weekday"],
    duration: true,
    calendarRange: false,
    calendarList: false,
    dayGroup: true,
  },
  {
    value: "weekend",
    aliases: ["weekends"],
    duration: true,
    calendarRange: false,
    calendarList: false,
    dayGroup: true,
  },
  {
    value: "month",
    aliases: [],
    duration: true,
    calendarRange: true,
    calendarList: true,
    dayGroup: false,
  },
  {
    value: "quarter",
    aliases: [],
    duration: true,
    calendarRange: true,
    calendarList: false,
    dayGroup: false,
  },
  {
    value: "year",
    aliases: ["yr", "yrs"],
    duration: true,
    calendarRange: true,
    calendarList: false,
    dayGroup: false,
  },
] as const;

type PeriodRecord = (typeof PeriodRecords)[number];
export type Period = (typeof PeriodRecords)[number]["value"];
export type DurationUnit = Period;

export const PeriodAliasEntries = PeriodRecords.flatMap((period) =>
  period.aliases.map((alias) => [alias, period.value] as const),
);
export const PeriodIdentityEntries = PeriodRecords.map(
  (period) => [period.value, period.value] as const,
);
export type PeriodWord = Period | (typeof PeriodAliasEntries)[number][0];
export const PeriodAliasMap: ReadonlyMap<PeriodWord, Period> = new Map([
  ...PeriodIdentityEntries,
  ...PeriodAliasEntries,
]);
export const PeriodWords: readonly PeriodWord[] = Array.from(
  PeriodAliasMap.keys(),
);

export type CalendarRangePeriod = Extract<
  PeriodRecord,
  { calendarRange: true }
>["value"];

export const CalendarRangePeriodValues = PeriodRecords.filter(
  (period): period is Extract<PeriodRecord, { calendarRange: true }> =>
    period.calendarRange,
).map((period) => period.value);

export type CalendarListPeriod = Extract<
  PeriodRecord,
  { calendarList: true }
>["value"];

export const CalendarListPeriodValues = PeriodRecords.filter(
  (period): period is Extract<PeriodRecord, { calendarList: true }> =>
    period.calendarList,
).map((period) => period.value);

export type DayGroupPeriod = Extract<PeriodRecord, { dayGroup: true }>["value"];

export const DayGroupPeriodValues = PeriodRecords.filter(
  (period): period is Extract<PeriodRecord, { dayGroup: true }> =>
    period.dayGroup,
).map((period) => period.value);

export const CalendarRangePeriodSet = new Set<Period>(
  CalendarRangePeriodValues,
);
export const CalendarListPeriodSet = new Set<Period>(CalendarListPeriodValues);
export const DayGroupPeriodSet = new Set<Period>(DayGroupPeriodValues);

export const MonthVocabularyValues: readonly MonthVocabularyEntry[] = [
  { value: "january", aliases: ["jan"], month: 1 },
  { value: "february", aliases: ["feb"], month: 2 },
  { value: "march", aliases: ["mar"], month: 3 },
  { value: "april", aliases: ["apr"], month: 4 },
  { value: "may", aliases: [], month: 5 },
  { value: "june", aliases: ["jun"], month: 6 },
  { value: "july", aliases: ["jul"], month: 7 },
  { value: "august", aliases: ["aug"], month: 8 },
  { value: "september", aliases: ["sep", "sept"], month: 9 },
  { value: "october", aliases: ["oct"], month: 10 },
  { value: "november", aliases: ["nov"], month: 11 },
  { value: "december", aliases: ["dec"], month: 12 },
];

export const WeekdayVocabularyValues: readonly WeekdayVocabularyEntry[] = [
  { value: "monday", aliases: ["mon", "mondays"], weekday: 1 },
  { value: "tuesday", aliases: ["tue", "tues", "tuesdays"], weekday: 2 },
  { value: "wednesday", aliases: ["wed", "wednesdays"], weekday: 3 },
  {
    value: "thursday",
    aliases: ["thu", "thur", "thurs", "thursdays"],
    weekday: 4,
  },
  { value: "friday", aliases: ["fri", "fridays"], weekday: 5 },
  { value: "saturday", aliases: ["sat", "saturdays"], weekday: 6 },
  { value: "sunday", aliases: ["sun", "sundays"], weekday: 7 },
];

export const RelativeVocabularyValues = [
  { value: "today" },
  { value: "tomorrow", aliases: ["tmr", "tmrw"] },
  { value: "yesterday" },
  { value: "now" },
] as const satisfies readonly RelativeVocabularyEntry[];

export const DurationUnitVocabularyValues: readonly DurationUnitVocabularyEntry[] =
  PeriodRecords.flatMap((period) => {
    if (!period.duration) {
      return [];
    }

    const plural = period.value.endsWith("s") ? period.value : `${period.value}s`;
    return [
      { value: period.value, unit: period.value },
      ...(plural === period.value ? [] : [{ value: plural, unit: period.value }]),
      ...period.aliases.map((alias) => ({ value: alias, unit: period.value })),
    ];
  });

export const RecurrenceFrequencyVocabularyValues: readonly RecurrenceFrequencyVocabularyEntry[] =
  [
    {
      value: "daily",
      cadence: { kind: "interval", every: { unit: "day", count: 1 } },
    },
    {
      value: "weekly",
      cadence: { kind: "interval", every: { unit: "week", count: 1 } },
    },
    {
      value: "fortnightly",
      cadence: { kind: "interval", every: { unit: "week", count: 2 } },
    },
    {
      value: "monthly",
      cadence: { kind: "interval", every: { unit: "month", count: 1 } },
    },
    {
      value: "quarterly",
      cadence: { kind: "interval", every: { unit: "month", count: 3 } },
    },
    {
      value: "yearly",
      cadence: { kind: "interval", every: { unit: "year", count: 1 } },
    },
  ];

export const DefaultDateVocabulary: DateVocabulary = {
  months: MonthVocabularyValues,
  weekdays: WeekdayVocabularyValues,
  relatives: RelativeVocabularyValues,
  durationUnits: DurationUnitVocabularyValues,
  recurrenceFrequencies: RecurrenceFrequencyVocabularyValues,
};

export const ConnectorValues = [
  "after",
  "and",
  "before",
  "between",
  "during",
  "following",
  "for",
  "from",
  "in",
  "minus",
  "of",
  "or",
  "plus",
  "preceding",
  "through",
  "to",
  "until",
  ",",
] as const;
export type Connector = (typeof ConnectorValues)[number];
export const ConnectorAliasEntries = [
  ["till", "until"],
  ["upto", "until"],
] as const satisfies readonly (readonly [string, Connector])[];
export const ConnectorAliasValues = ConnectorAliasEntries.map(([alias]) => alias);

export const SmallCardinals: ReadonlyMap<string, number> = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
]);

export const Tens: ReadonlyMap<string, number> = new Map([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);

export const Scales: ReadonlyMap<string, number> = new Map([
  ["hundred", 100],
  ["thousand", 1000],
]);

export const TeenOrdinals = Array.from(SmallCardinals)
  .filter(([, value]) => value >= 13)
  .map(([word, value]) => [`${word}th`, value] as const);

export const TensOrdinals = Array.from(
  Tens,
  ([word, value]) => [`${word.slice(0, -1)}ieth`, value] as const,
);

export const ScaleOrdinals: ReadonlyArray<readonly [string, string]> =
  Array.from(Scales, ([word]) => [`${word}th`, word] as const);

export const SmallOrdinals: ReadonlyMap<string, number> = new Map([
  ["first", 1],
  ["second", 2],
  ["third", 3],
  ["fourth", 4],
  ["fifth", 5],
  ["sixth", 6],
  ["seventh", 7],
  ["eighth", 8],
  ["ninth", 9],
  ["tenth", 10],
  ["eleventh", 11],
  ["twelfth", 12],
  ...TeenOrdinals,
  ...TensOrdinals,
]);

export const NumberWords = [
  ...SmallCardinals.keys(),
  ...Tens.keys(),
  ...Scales.keys(),
  ...SmallOrdinals.keys(),
  ...ScaleOrdinals.map(([ordinal]) => ordinal),
] as const;

export const BoundarySideValues = ["end", "start"] as const;
export type BoundaryEndpointSide = (typeof BoundarySideValues)[number];

export const RelativeModifierRecords = [
  { value: "this", yearReference: true },
  { value: "next", yearReference: true, forward: true },
  { value: "upcoming", forward: true },
  { value: "future", forward: true },
  { value: "last", yearReference: true, backward: true, placement: true },
  { value: "previous", yearReference: true, backward: true },
  { value: "past", backward: true },
] as const;
type RelativeModifierRecord = (typeof RelativeModifierRecords)[number];
export type RelativeModifier = RelativeModifierRecord["value"];
export const RelativeModifierValues = RelativeModifierRecords.map(
  (modifier) => modifier.value,
);
export const RelativeModifierSet = new Set<RelativeModifier>(
  RelativeModifierValues,
);
export type YearReferenceModifier = Extract<
  RelativeModifierRecord,
  { yearReference: true }
>["value"];
export const YearReferenceModifierValues = RelativeModifierRecords.filter(
  (
    modifier,
  ): modifier is Extract<RelativeModifierRecord, { yearReference: true }> =>
    "yearReference" in modifier,
).map((modifier) => modifier.value);
export const YearReferenceModifierSet = new Set<RelativeModifier>(
  YearReferenceModifierValues,
);
export const ForwardRelativeModifierValues = RelativeModifierRecords.filter(
  (modifier): modifier is Extract<RelativeModifierRecord, { forward: true }> =>
    "forward" in modifier,
).map((modifier) => modifier.value);
export const ForwardRelativeModifierSet = new Set<RelativeModifier>(
  ForwardRelativeModifierValues,
);
export const BackwardRelativeModifierValues = RelativeModifierRecords.filter(
  (modifier): modifier is Extract<RelativeModifierRecord, { backward: true }> =>
    "backward" in modifier,
).map((modifier) => modifier.value);
export const BackwardRelativeModifierSet = new Set<RelativeModifier>(
  BackwardRelativeModifierValues,
);
export const BoundaryPlacementValues = [
  "first",
  ...RelativeModifierRecords.filter(
    (
      modifier,
    ): modifier is Extract<RelativeModifierRecord, { placement: true }> =>
      "placement" in modifier,
  ).map((modifier) => modifier.value),
] as const;
export type BoundaryPlacement = (typeof BoundaryPlacementValues)[number];
export type RelativeDateValue =
  (typeof RelativeVocabularyValues)[number]["value"];
export const RelativeDateValues = RelativeVocabularyValues.map(
  (relative) => relative.value,
);
export const RelativeDateSet = new Set<RelativeDateValue>(RelativeDateValues);

export const ExclusionMarkerRecords = [
  { value: "except", multiToken: false },
  { value: "excluding", multiToken: false },
  { value: "skip", multiToken: false },
  { value: "other than", multiToken: true },
] as const;
export const ExclusionMarkerValues = ExclusionMarkerRecords.map((marker) => marker.value);
export type ExclusionMarker = (typeof ExclusionMarkerValues)[number];
export const ExclusionMarkerAliasEntries = [["excl", "excluding"]] as const;
export const ExclusionMarkerAliasValues = ExclusionMarkerAliasEntries.map(([alias]) => alias);
export const MultiTokenExclusionMarkerValues = ExclusionMarkerRecords.filter((marker) => marker.multiToken).map(
  (marker) => marker.value,
);
export const ExclusionWords = [
  ...ExclusionMarkerValues,
  ...ExclusionMarkerAliasValues,
  ...MultiTokenExclusionMarkerValues.flatMap((marker) => marker.split(" ")),
  "holidays",
] as const;

export const SamplerCommandRecords = [
  { value: "all", chunk: true },
  { value: "alternate", chunk: true, interval: 2 },
  { value: "every", chunk: true },
  { value: "every other", chunk: false, interval: 2 },
  { value: "select", chunk: true },
] as const;
type SamplerCommandRecord = (typeof SamplerCommandRecords)[number];
export const SamplerCommandValues = SamplerCommandRecords.map(
  (command) => command.value,
);
export type SamplerCommand = (typeof SamplerCommandValues)[number] | undefined;
export const SamplerChunkCommandValues = SamplerCommandRecords.filter(
  (command) => command.chunk,
).map((command) => command.value);
export type SamplerChunkCommand = (typeof SamplerChunkCommandValues)[number];
export const MultiTokenSamplerCommandValues = SamplerCommandRecords.filter(
  (command) => !command.chunk,
).map((command) => command.value);
export const AlternatingSamplerCommandValues = SamplerCommandRecords.filter(
  (command): command is Extract<SamplerCommandRecord, { interval: 2 }> =>
    "interval" in command,
).map((command) => command.value);
export const AlternatingSamplerCommandSet = new Set<SamplerCommand>(
  AlternatingSamplerCommandValues,
);

export const SamplerParityRecords = [
  { value: "even", startIndex: 1, dayRemainder: 0 },
  { value: "odd", startIndex: 0, dayRemainder: 1 },
] as const;
export const SamplerParityValues = SamplerParityRecords.map(
  (parity) => parity.value,
);
export type SamplerParity = (typeof SamplerParityValues)[number];
export const SamplerParitySet = new Set<string>(SamplerParityValues);
export const SamplerParityStartIndexMap = new Map(
  SamplerParityRecords.map(
    (parity) => [parity.value, parity.startIndex] as const,
  ),
);
export const SamplerParityDayRemainderMap = new Map(
  SamplerParityRecords.map(
    (parity) => [parity.value, parity.dayRemainder] as const,
  ),
);

export const SamplerModifierWords = [
  ...SamplerParityValues,
  "numbered",
] as const;
export const SamplerWords = Array.from(
  new Set([
    ...SamplerCommandValues.flatMap((command) => command.split(" ")),
    ...SamplerModifierWords,
  ]),
);

export const RelationDirectionValues = ConnectorValues.filter(
  (
    connector,
  ): connector is Extract<
    Connector,
    "after" | "before" | "following" | "preceding"
  > =>
    connector === "after" ||
    connector === "before" ||
    connector === "following" ||
    connector === "preceding",
);
export type RelationDirection = (typeof RelationDirectionValues)[number];
export const RelationDirectionSet = new Set<Connector>(RelationDirectionValues);
export const TransformOperatorValues = ConnectorValues.filter(
  (connector): connector is Extract<Connector, "minus" | "plus"> =>
    connector === "minus" || connector === "plus",
);
export type TransformOperator = (typeof TransformOperatorValues)[number];
export const TransformOperatorSet = new Set<Connector>(TransformOperatorValues);

export const GrammarWordSet = new Set([
  ...ConnectorValues,
  ...ConnectorAliasValues,
  ...NumberWords,
  ...PeriodWords,
  ...BoundarySideValues,
  ...ExclusionWords,
  ...SamplerWords,
]);
