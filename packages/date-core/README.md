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

`namedDatesVocabulary` registers phrases the parser can resolve, such as `christmas` or `company offsite`. Each entry has `value`, optional `aliases`, optional `isHoliday`, and `resolveDate`.

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
  ],
});
```

Setting `isHoliday: true` on an entry allows Calchemy to use it for parsing phrases like `excluding holidays`.

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
