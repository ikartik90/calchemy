# Project Overview and Structure

## Product Direction

This project is a headless natural language date engine. The core value is reliable parsing, ambiguity handling, Temporal-based date values, and serialization. Two independent parsers share one value model: `date-core`, a deterministic grammar that runs offline, and `date-jev`, which reads phrases with TypeSafe's Jev model. Neither has a UI or framework dependency.

## Package Boundaries

- `@calchemy/date-core`: parser, candidate ranking, ambiguity modeling, Temporal conversion, JSON/form serialization, and parser context.
- `@calchemy/date-holidays`: optional holiday and landmark-date providers.
- `@calchemy/date-jev` (in progress): standalone parser for wording date-core rejects, such as typos, aliases, and unfamiliar phrasing. See [date-jev](#date-jev).

# Documentation References

Agents MUST consult official documentation before implementing APIs or framework-specific behavior. Do not rely on assumptions for current syntax, package exports, or browser support.

## Required References

| Topic                        | Reference                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------- |
| TypeScript                   | https://www.typescriptlang.org/docs/                                              |
| Temporal                     | https://tc39.es/proposal-temporal/docs/                                           |
| `@js-temporal/polyfill`      | https://www.npmjs.com/package/@js-temporal/polyfill                               |
| npm package publishing       | https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry |
| tsup                         | https://tsup.egoist.dev/                                                          |
| Vitest                       | https://vitest.dev/                                                               |
| TypeSafe Jev                 | https://docs.typesafe.ai/llms.txt                                                 |

# Directory Map

## Repository Layout

```txt
.
├── packages/
│   ├── date-core/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── chunks/
│   │   │   │   ├── diagnostics/
│   │   │   │   ├── expression/
│   │   │   │   ├── primitives/
│   │   │   │   ├── resolve/
│   │   │   │   └── slice/
│   │   │   ├── serialize/
│   │   │   └── temporal/
│   │   ├── tests/
│   │   └── README.md
│   └── date-jev/
│       ├── src/
│       │   └── core/   (copy of date-core's math)
│       └── tests/
└── scripts/
```

## Ownership Rules

- `packages/date-core` owns parser semantics, candidate ranking, ambiguity modeling, Temporal value creation, expected-value helpers, and JSON/form serialization.
- Parser behavior belongs in `date-core` or `date-jev`, never in demos or scripts.
- `scripts/parse-date.mjs` is for parser CLI checks and developer workflows. Keep reusable parsing behavior in `date-core`.
- `packages/date-core/README.md` is the README npm publishes; the root `README.md` only points to it.
- Future optional workspaces such as holiday providers, docs, or examples should live under their own package or top-level directory and consume `date-core` through public exports. `date-jev` is the exception: it stands alone.

# Build and Test Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm test -- --run
pnpm lint
pnpm typecheck
```

For package-scoped work, prefer workspace filters:

```bash
pnpm --filter @calchemy/date-core test
pnpm --filter @calchemy/date-core typecheck
```

# Architecture and Design Patterns

## Core Parser API

Expose parsing through the `Calchemy` instance with a rich result:

```ts
const calchemy = await createCalchemy();
calchemy.parseDate(input, context);
```

Use `parseDateWithTemporal(input, context, Temporal)` only when injecting a Temporal implementation directly.

The parser must support these result states:

- `valid`: one clear interpretation.
- `ambiguous`: multiple plausible interpretations that need user or context resolution.
- `invalid`: no reliable interpretation, with useful errors and possible corrections.

The parser should return candidates, corrections, and ambiguity groups rather than throwing for ordinary parse failures.

## Date Values

Use Temporal throughout the parser and public value model. Use `Temporal.PlainDate` for calendar dates and `Temporal.PlainDate` pairs for ranges. Use `ParseDateContext.timeZone` and `ParseDateContext.referenceDate` for relative phrases like `today`, `now`, or `last 90 days`; resolve live dates with `Temporal.Now.plainDateISO(timeZone)`. Use locale, week-start, and holiday settings as parser context, not as Temporal primitives. Do not use JavaScript `Date` internally; only support it at explicit interop boundaries if a public adapter requires it.

The normalized value model should support:

- Single date.
- Date range.
- Multiple discrete dates.

Always provide JSON/form serialization helpers alongside Temporal values.

## Ambiguity Is First-Class

Model ambiguity explicitly. Examples include:

- `03/04/25`: month/day ordering.
- `next Friday`: upcoming Friday versus Friday of next week.
- `last 90 days`: inclusive versus previous complete days.
- `Jul 1, 27`: 2027 versus year 27.
- `holidays`: country, region, or custom calendar.

Do not hide ambiguity by silently choosing one interpretation unless the caller requests best-effort parsing.

## date-core Pipeline

Prefer a deterministic, inspectable pipeline:

1. Build vocabulary lookups, including configured named dates.
2. Normalize and tokenize input: clean casing, whitespace, punctuation, aliases, articles, possessives, and known typos while recording corrections.
3. Standardize tokens into typed chunks such as weekdays, months, periods, connectors, ordinals, shorthands, commands, exclusions, and numbers.
4. Resolve context: apply the reference date plus locale, week-start, date-order preference, holiday provider, and relative-range options.
5. Parse numeric date candidates first. Return `valid` for one candidate or `ambiguous` with a date-order group for competing candidates.
6. Slice known language chunks into a parse tree of boundaries plus samplers, relations, transforms, and exclusions.
7. Lower the parse tree into an expression tree: every compositional boundary (`first week of …`, `each month in …`, `last 2 weeks of …`, `15th of …`, `first half of …`) becomes a `select` or `iterate` node over its inner expression, so `scope` nodes only ever carry leaf boundaries. `boundaryToExpression` is the single lowering pass.
8. Resolve the expression tree into concrete Temporal values: `resolveExpression` evaluates composition nodes, `resolveBoundary` evaluates leaves only, then relations, sampling, transforms, and exclusions apply, and a `DateValue` is materialized.
9. Return `valid` with the best candidate, or `invalid` with structured errors — `impossible-date` with suggestions when the phrase names a date that does not exist, `unsupported-expression` with the offending token otherwise — and correction metadata.

Known grammar and phrase support should remain distinct from vocabulary aliases and fuzzy vocabulary correction. Three alias tables live in `parser/types.ts` and are applied during normalization, each recording a `shorthand` correction: `GrammarAliasEntries` (one grammar word for another, `beginning` → `start`), `PhraseShorthandEntries` (one token or a few for a whole phrase, `eom` → `end of this month`, `year to date` → `start of this year until today`), and the vocabulary aliases (`tmrw` → `tomorrow`). Prefer adding to a table over adding a grammar rule when the new wording is a pure synonym of one the grammar already accepts.

Resolution treats `options.scope` (set while resolving an exclusion) as "read a bare period as a recurring filter inside the parent window". It propagates through wrappers such as sampling but not into a selector's range argument: in `except the third week of august`, `august` names the range to select from.

## date-jev

`@calchemy/date-jev` (in progress, private until its first release) is a standalone parser. It depends on `@typesafe-ai/sdk` and `@js-temporal/polyfill`. It and `date-core` each build, test, and ship without the other.

- **Jev reads, code calculates.** Code proposes split points at connector words. Jev judges with Nouls whether each piece is a complete date phrase, and labels each piece's role and words with Choices. Code lists the numbers written in a piece and Jev picks which one is the year, so date-core's math expands a written `27`. A count is a Choice from 1 to 100, plus any larger number written in digits, so `two weeks` reads as well as `90 days`. All date math runs in code.
- **Vocabulary lives in date-jev** as Choice lists: months, weekdays, ordinals, numbers, and shorthands. Ask Jev about meaning (`does "tmrw" mean "tomorrow" here?`); it reads meaning well and letters poorly.
- **Copied math.** Jev's answers build the tree date-core's resolver takes (`DateExpression`), and date-jev resolves it with a copy of date-core's math in `packages/date-jev/src/core/`. That folder mirrors `packages/date-core/src/` file for file and holds only copied code; date-jev's own code sits beside it. The `chunks/index.ts` and `slice/index.ts` barrels are the two edits: they drop date-core's phrase-reading entry points. Math fixes land in date-core first and reach the copy by syncing. Each copy or sync commit names its source, `Copy date-core math from <hash>`, and this lists the date-core changes to bring across: `git log --oneline <hash>..main -- $(cd packages/date-jev/src/core && git ls-files '*.ts' | sed 's#^#packages/date-core/src/#')`.
- **Same results.** date-jev returns the same `valid` / `ambiguous` / `invalid` states and `DateValueJSON` shape as date-core, so apps can swap or mix the two.
- **Caller's key, caller's choice.** date-jev takes a `TypeSafeClient` the app builds, so the app owns the API key. The caller decides when date-jev runs: after date-core returns `invalid`, after `invalid` or `ambiguous`, or for every phrase.
- **Setup command (before the first release).** `npx @calchemy/date-jev init` asks for the key without echoing it, writes `TYPESAFE_API_KEY` to the project's `.env`, and adds `.env` to `.gitignore`. The developer runs it on purpose; installing date-jev runs nothing, and the library code still never reads the key.
- **Confidence.** An `ambiguous` result's confidence is the sum of its competing readings' confidences.
- **Comparison.** `pnpm compare-engines [phrase …]` runs the same phrases through both parsers, by default those in `scripts/compare-phrases.txt`, and groups them: disagree, one parser ambiguous, only one parser reads it, neither, agree. It prints Jev's answers beside each phrase and caches them by exact request, so re-runs are free until the questions change. With the math shared, a disagreement points at how one parser read the phrase. A person decides the right answer, and it becomes a pinned test in the package that got it wrong.

# Coding Conventions and Style Guidelines

## TypeScript

- Use strict TypeScript.
- Prefer discriminated unions for parser results and date values.
- Keep exported types stable, documented, and intentionally named.
- Avoid `any`; use `unknown` and narrow when needed.

## API Naming

Prefer simple public names:

- `parseDate`
- `createCalchemy`
- `DateValue`
- `ParseDateResult`

Avoid exposing internal terms like "expression" unless they clarify a specific type.

## Error Handling

Do not throw for normal invalid user input. Return structured invalid results. Reserve thrown errors for programmer mistakes, impossible states, or invalid configuration.

## Dependencies

Keep dependencies minimal. Parser behavior must be testable without any browser or framework APIs. Treat holiday providers and `date-jev` as optional layers that `date-core` knows nothing about.

# Testing Guidelines

## Parser Tests

Build the parser from a corpus of real phrases and expected results. Cover:

- Relative dates: `today`, `tomorrow`, `three weeks from now`.
- Ranges: `last 90 days`, `christmas 2026-Jul 1, 27`.
- Discrete dates: `all mon and sat until end of next month`.
- Exclusions: `excluding holidays`, `except tomorrow`, `skip next week`.
- Ambiguity: numeric dates, two-digit years, relative anchors.
- Typos and shorthand: month names, weekdays, common abbreviations.
- Phrasing variants: a wording the parser did not accept, paired with the pinned value of the equivalent wording it already did (`in 10 days` = `10 days from now`). Lives in the `phrasing variants` block of `tests/parser.test.ts`; the expected value must come from an already-pinned row, never from running the implementation.
- Nested selections: a compositional phrase inside another boundary (`start of last 2 weeks of next quarter`), pinned to agree with the top-level phrase.
- Impossible dates: `29 feb 2027` and friends must return `impossible-date` with suggestions, never `unsupported-expression`. Lives in `tests/impossible-date.test.ts`.
- Lowering invariant: `tests/expression-lowering.test.ts` lists every compositional phrase shape and asserts no `scope` node carries a compositional boundary. Add a row there whenever a new compositional boundary kind is introduced.

Tests should fix the reference date, locale, week-start, and holiday calendars to avoid flaky results.

## date-jev Tests

Tests replay recorded Jev answers through a fake client (the SDK's `fetch` option), so the suite runs offline. `pnpm record-jev [phrase …]` records or refreshes them from the live API with the developer's own key, read from the project's git-ignored `.env`. A replay fails when date-jev's questions no longer match its recording; re-record that phrase. Test at two seams: `parseDate(input, context)` end to end, and Jev answers into a tree. The resolver's tests come across with the copied math, from `tests/expression-resolver.test.ts`.

# General Instructions

- Parser semantics belong in `date-core` and `date-jev`; anything else consumes their public APIs.
- Preserve ambiguity and candidate metadata so product UIs can explain choices.
- Prefer Temporal and canonical JSON over JavaScript `Date`.
- Keep examples separate from library internals.
- Before adding framework, build, or publishing code, check the official docs listed above.
- Do not introduce broad abstractions until tests show repeated complexity.
- When changing behavior, add or update parser corpus tests first.
- Use @.cursor/skills/writing/SKILL.md for writing documentation and README.
