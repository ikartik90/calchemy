# Calchemy

Calchemy is a headless date engine that parses natural language input. It turns phrases like `8 weeks from now` (single date), `Christmas 2026-Jul 1, 27` (date range), and `mondays and wednesdays next month` (multiple dates) into Temporal values.

## Install

```bash
pnpm add @calchemy/date-core
```

## Using Date Core (`@calchemy/date-core`)

```ts
import { createCalchemy } from "@calchemy/date-core";

// Returns promise immediately if the client already supports Temporal
const calchemy = await createCalchemy();
console.log(calchemy.parseDate("tomorrow"));
```

`createCalchemy()` evaluates whether the client supports Temporal by reading `globalThis.Temporal` from the runtime, and returns the promise immediately if it does. Otherwise, it loads `@js-temporal/polyfill` asynchronously.

If you would rather skip auto-detection and prefer a synchronous approach instead, use `createCalchemyWithTemporal(Temporal)`:

```ts
import { createCalchemyWithTemporal } from "@calchemy/date-core";

const calchemy = createCalchemyWithTemporal(globalThis.Temporal);
```

### What it understands

A sample of accepted phrasings, each pinned by the test corpus. The reference date in these examples is Wednesday, 27 May 2026.

| You type | Calchemy returns |
| --- | --- |
| `tomorrow`, `in 10 days`, `a week from now`, `2 months ago` | a single date |
| `tuesday`, `this coming friday`, `next friday` | the upcoming Tuesday; the upcoming Friday; the Friday of next week |
| `the 15th`, `15th of next month`, `last weekday of next month` | a single date inside that month |
| `next april`, `last june`, `first half of 2027`, `q3 2027` | a date range |
| `last 90 days`, `within 2 weeks`, `ytd`, `eom`, `year to date` | a range or single date, expanded from the shorthand |
| `start of last 2 weeks of next quarter` | a single date, composed from the inner phrase |
| `every monday next month`, `15th of every month`, `last day of every month` | multiple dates |
| `all weekdays in october excluding holidays`, `next week except tomorrow` | multiple dates with exclusions |
| `2020 august`, `august all days`, `august mondays` | the same as `august 2020`, `all days in august`, `mondays in august`; a year or a day pattern may sit on either side of its range |
| `board meeting`, `board meeting in q3`, `holidays in december` | the dates of a configured named set; only those inside the period when one is given |
| `m13`, `q5`, `week 60` | a month, quarter, or week number past the calendar rolls into the next year (`m13` is January 2027); written with a year, as in `m13 2026`, it is an error |
| `29 feb 2027` | an `impossible-date` error suggesting `2027-02-28` and `2028-02-29` |
| `03/04/25` | an `ambiguous` result with one candidate per date order |

## Configuring calchemy options

`createCalchemy()` takes three optional settings. Set them once at startup; override any of the parse settings on a single call with the second argument to `parseDate()`.

```ts
const calchemy = await createCalchemy({
  defaultContext: {
    locale: "en-US",
    timeZone: "America/New_York",
    weekStartsOn: 1,
    dateOrderPreference: ["MDY", "DMY"],
  },
  completionSources: [
    { id: "phrases", entries: [{ value: "previous 90 days" }] },
  ],
});
```

**`defaultContext`** — parse settings applied to every call unless you override them. You can put any of these inside it:

- `locale` — how dates are labeled in results and the calendar.
- `timeZone` — which "today" means for phrases like `tomorrow` and `last 90 days`.
- `referenceDate` — fix the as-of date (useful in tests). Overrides `timeZone` when both are set.
- `weekStartsOn` — which day starts the week (`0` = Sunday, `1` = Monday, and so on).
- `dateOrderPreference` — how to read numeric dates like `03/04/25`.
- `lastNDaysIncludesToday` — whether `last 90 days` counts today (default yes).

```ts
// Override just for this one parse
calchemy.parseDate("today", {
  referenceDate: Temporal.PlainDate.from("2026-05-27"),
});
```

**`completionSources`** — phrases to suggest while the user types (press Tab to accept). Calchemy does not auto-suggest built-in words like `tomorrow` or `july`; add whatever phrases you want the field to offer.

### Named dates vocabulary

`namedDatesVocabulary` registers phrases the parser can resolve, such as `christmas` or `board meeting`. Each entry has `value`, optional `aliases`, optional `isHoliday`, and exactly one of `resolveDate` (one date a year) or `resolveDates` (any number of dates a year).

```ts
const calchemy = await createCalchemy({
  namedDatesVocabulary: [
    {
      value: "christmas",
      aliases: ["xmas"],
      isHoliday: true,
      resolveDate({ year, context }) {
        return context.referenceDate.with({ year, month: 12, day: 25 });
      },
    },
    {
      value: "board meeting",
      aliases: ["board", "quarterly board"],
      resolveDates({ year, context }) {
        return [1, 4, 7, 10].map((month) => context.referenceDate.with({ year, month, day: 15 }));
      },
    },
  ],
});
```

Values and aliases may be several words long, and an alias may share its first word with the full name; the parser matches the longest name at each position.

A named set behaves like any other set of dates: `board meeting` returns the four dates, `board meeting next year` the following year's, `board meeting and christmas` the union, and `weekdays in july excluding board meeting` drops the July date. Contiguous dates come back as a range, and a single date as a single date. The parser sorts the dates and drops duplicates and nulls.

A named set inside a period keeps only the dates that fall in it: `board meeting in q3`, `q3 board meeting`, `all board meetings in first half of 2027`, `board meeting between july and december`, and `board meeting from tomorrow until end of year`. A period with none of the set's dates returns an empty list. `holidays in december` works the same way over the configured holidays.

Setting `isHoliday: true` on an entry allows Calchemy to use it for parsing phrases like `excluding holidays`; every date of an `isHoliday` set counts as a holiday.

## Error messages

When a phrase cannot be read, the result is `{ status: "invalid", errors: [...] }`. Each error says what went wrong and, wherever the parser can tell, what to type instead. Every message is pinned by the test corpus.

| You type | `code` | `message` |
| --- | --- | --- |
| `nxt week` | `unsupported-expression` | Calchemy does not understand "nxt". Did you mean "next"? |
| `tomorrow until march` (in May 2026) | `unsupported-expression` | This range ends before it starts: it runs from 2026-05-28 to 2026-03-31. Add a year to the end, for example "tomorrow until march 2027". |
| `mondays in` | `unsupported-expression` | "in" needs a period after it, for example "mondays in june". |
| `in 3` | `unsupported-expression` | "3" needs a unit such as days, weeks, or months, for example "in 3 days". |
| `the 32nd` | `unsupported-expression` | There is no 32nd day in any month. Days run from 1st to 31st. |
| `m13 2026` | `unsupported-expression` | There is no month 13 in 2026. Months run from m1 to m12. |
| `3rd friday` | `unsupported-expression` | "3rd friday" needs a period to count within, for example "3rd friday of next month". |
| `29 feb 2027` | `impossible-date` | 2027 is not a leap year, so February 29 does not exist. |
| `` (nothing) | `empty-input` | Enter a date phrase. |

An error may also carry:

- `token` — where in the input the problem is (`start`/`end` offsets and the `raw` text), for underlining.
- `suggestions` — real ISO dates to offer when the phrase names a date that does not exist, as for `29 feb 2027`.
- `suggestedInput` — a rewritten phrase that parses, such as `tomorrow until march 2027` or `2020-03-15`, for a one-click fix.

## Form and JSON values

Runtime values are Temporal objects. Boundaries use plain strings.

```ts
const formValue = calchemy.toFormValue(result.value); // 2026-12-25, 2026-12-25/2027-07-01, or comma-separated
const jsonValue = calchemy.toJSON(result.value);
```

```ts
type DateValueJSON =
  | { kind: "single"; date: string }
  | { kind: "range"; start: string; end: string }
  | { kind: "multiple"; dates: string[] };
```

## How it works

Calchemy is parser-only. `@calchemy/date-core` owns parser semantics, Temporal values, ambiguity, JSON, and form serialization, with no UI or framework dependency.

Here's how the parser interprets natural-language dates:

1. Normalize and tokenize: Cleans the input, expands shorthands like `eom` and `ytd`, and splits it into typed tokens
2. Standardize chunks: Classifies the tokens into typed semantic chunks
3. Resolve context: Applies reference date, locale, and preferences
4. Resolve ambiguity: Surfaces competing numeric date interpretations
5. Slice: Reads the chunks into a parse tree of boundaries, samplers, relations, and exclusions
6. Lower: Turns compositional phrases (`first week of …`, `15th of each month`, `last 2 weeks of …`) into an expression tree of `select` and `iterate` nodes over leaf boundaries
7. Resolve values: Evaluates the expression tree into concrete Temporal values
8. Return result: Returns status, Temporal value, candidates, and corrections — or a structured error, such as `impossible-date` with suggested real dates for `29 feb 2027`
