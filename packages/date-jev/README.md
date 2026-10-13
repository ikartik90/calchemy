# date-jev

`@calchemy/date-jev` reads natural language date phrases with [TypeSafe](https://docs.typesafe.ai)'s Jev model and returns the same Temporal values as [`@calchemy/date-core`](https://www.npmjs.com/package/@calchemy/date-core). It reads wording a fixed grammar trips over: typos (`wensday`), dates inside a sentence (`can we meet next tuesday?`), spelled-out numbers (`next two weeks`, `november fifth`), and everyday phrasing (`the friday after next`, `a week on friday`, `sunday just gone`).

Jev only reads the words. It answers questions such as "which weekday is written here?" and "is this a range?", and date-jev builds the result with date-core's own date math. Each phrase costs one call to TypeSafe, paid with your own key.

## Install

```bash
pnpm add @calchemy/date-jev @typesafe-ai/sdk
```

## Set up your TypeSafe key

Run this from your project's folder:

```bash
npx @calchemy/date-jev init
```

It asks for your key without showing it, saves it as `TYPESAFE_API_KEY` in your project's `.env`, and adds `.env` to `.gitignore`. Installing date-jev runs nothing, and the library never reads the key: your app builds the TypeSafe client and hands it over.

## Using date-jev

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevParser, toJSON } from "@calchemy/date-jev";

const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY });
const jev = await createJevParser({ client });

const result = await jev.parseDate("the friday after next");
if (result.status === "valid") {
  console.log(toJSON(result.value)); // { kind: "single", date: "..." }
}
```

Node 20.6 and later load `.env` for you with `node --env-file=.env app.js`.

Call date-jev from your server. In a browser, every visitor could read your key from the page, so send the phrase to your own server and parse it there.

`parseDate` takes the same context as date-core, and every field is optional:

```ts
import { Temporal } from "@js-temporal/polyfill";

await jev.parseDate("next friday", {
  referenceDate: Temporal.PlainDate.from("2026-10-13"), // defaults to today in `timeZone`
  timeZone: "America/New_York",
  locale: "en-US",
  weekStartsOn: 1, // Monday; the default 0 is Sunday
  dateOrderPreference: ["MDY", "DMY", "YMD"],
  lastNDaysIncludesToday: true,
});
```

## Results

`parseDate` returns one of three results, the same three date-core returns:

| `status` | What it holds |
| --- | --- |
| `valid` | `value`, a Temporal date, range, or list; `confidence` from 0 to 1; and `model`, the Jev version that answered, such as `jev-1.13.0`. |
| `ambiguous` | `candidates`, each with an `id`, `value`, `confidence`, and `label`, and a `confidence` that sums theirs. `june 27` could be June 27 this year or all of June 2027. |
| `invalid` | `errors`, such as `{ code: "unsupported-expression", message: 'Calchemy could not read "banana" as a date.' }`. Empty input returns `empty-input` without calling TypeSafe. |

A result is as confident as the weakest answer Jev gave for the words it used. Pick a cutoff that suits your app and confirm anything below it with the person: TypeSafe's date extraction cookbook sends answers below 0.6 to review.

`toJSON(value)` turns any value into plain strings, the same `DateValueJSON` shape date-core uses:

```ts
type DateValueJSON =
  | { kind: "single"; date: string }
  | { kind: "range"; start: string; end: string }
  | { kind: "multiple"; dates: string[] };
```

## Using date-jev with date-core

The two packages stand alone, and you decide when date-jev runs. A common setup reads every phrase with date-core, which runs offline and costs nothing, and asks date-jev only when date-core can't read the phrase:

```ts
import { createCalchemy } from "@calchemy/date-core";

const calchemy = await createCalchemy();

async function parse(input: string) {
  const offline = calchemy.parseDate(input);
  return offline.status === "invalid" ? jev.parseDate(input) : offline;
}
```

You can also ask date-jev after an `ambiguous` result, or for every phrase.

## What it reads

| Kind | Examples |
| --- | --- |
| Days | `today`, `tmrw`, `wensday`, `next friday`, `the friday after next`, `sunday just gone`, `due friday` |
| Counted from a day | `a week on friday`, `the day after friday`, `two weeks after tomorrow`, `3 days before next friday` |
| Calendar dates | `jul 1`, `5th nov`, `november fifth`, `march 15 2020`, `6 mar 27`, `the 15th` |
| Months and periods | `april`, `next april`, `august 2020`, `next month`, `previous quarter`, `this year` |
| Ranges | `today until friday`, `monday through friday`, `aug 10-14`, `10-14 aug`, `dec 20 until jan 3` |
| Counts from today | `last 90 days`, `next two weeks`, `over the next 30 days`, `in 10 days`, `2 months ago`, `3 quarters from now` |

date-jev follows date-core's rules for what a phrase means. A bare weekday is the coming one, `this friday` is Friday of this week, and a range end without its own year or month is the first match on or after the start, so `dec 20 until jan 3` ends in the following year.

date-jev doesn't read holidays and other named dates (`christmas`), exclusions (`excluding weekends`), lists (`mondays and wednesdays`), or times yet. date-core reads most of these.

## Cost and model versions

Every `parseDate` call sends one request to TypeSafe, except for empty input. TypeSafe answers with its current Jev model, and `result.model` names the version. A new model version can read a phrase differently, so check `model` when a result changes.

## How it works

1. Split: when a phrase has a connector such as `until`, `to`, or a dash, code cuts it into a start and an end.
2. Ask: one TypeSafe call asks Jev a set of questions about the whole phrase and each end: which day, weekday, month, or day of the month is written; which number is the year or the count; whether the phrase counts days from another day; and, for a split phrase, whether it names a range at all.
3. Build: code turns the answers into the same tree date-core builds for that phrase.
4. Resolve: a copy of date-core's date math turns the tree into Temporal values.
5. Return: `valid`, `ambiguous`, or `invalid`, with Jev's confidence and model version.
