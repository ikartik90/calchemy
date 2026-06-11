# Project Overview and Structure

## Product Direction

This project is a natural language date engine with optional headless React components. The core value is reliable parsing, ambiguity handling, Temporal-based date values, serialization, and inline tab completion. The React layer should be a consumer of the engine, not the source of parsing truth.

## Package Boundaries

- `@calchemy/date-core`: parser, candidate ranking, ambiguity modeling, Temporal conversion, JSON/form serialization, and parser context.
- `@calchemy/date-react`: headless React primitives and hooks built on `date-core`.
- `@calchemy/date-holidays`: optional holiday and landmark-date providers.
- `@calchemy/date-fuzzy`: optional typo, shorthand, and token-correction helpers.

# Documentation References

Agents MUST consult official documentation before implementing APIs or framework-specific behavior. Do not rely on assumptions for current syntax, package exports, or browser support.

## Required References

| Topic                        | Reference                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------- |
| React                        | https://react.dev/reference/react                                                 |
| TypeScript                   | https://www.typescriptlang.org/docs/                                              |
| Temporal                     | https://tc39.es/proposal-temporal/docs/                                           |
| `@js-temporal/polyfill`      | https://www.npmjs.com/package/@js-temporal/polyfill                               |
| Radix UI primitives          | https://www.radix-ui.com/primitives/docs/overview/introduction                    |
| WAI-ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/                                                  |
| npm package publishing       | https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry |
| tsup                         | https://tsup.egoist.dev/                                                          |
| Vitest                       | https://vitest.dev/                                                               |

# Directory Map

## Repository Layout

```txt
.
├── packages/
│   ├── date-core/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── chunks/
│   │   │   │   ├── primitives/
│   │   │   │   ├── resolve/
│   │   │   │   └── slice/
│   │   │   ├── serialize/
│   │   │   └── temporal/
│   │   └── tests/
│   ├── date-react/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   └── tests/
└── scripts/
```

## Ownership Rules

- `packages/date-core` owns parser semantics, candidate ranking, ambiguity modeling, Temporal value creation, expected-value helpers, and JSON/form serialization.
- Parser behavior belongs in `date-core`, never in React components, demos, or scripts.
- `packages/date-react` owns headless React primitives and hooks that consume the public `date-core` API. Keep it unstyled, composable, and independent from popover or styling libraries.
- `scripts/parse-date.mjs` is for parser CLI checks and developer workflows. Keep reusable parsing behavior in `date-core`.
- Future optional workspaces such as holiday providers, fuzzy matching, docs, or examples should live under their own package or top-level directory and consume `date-core` through public exports.

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
pnpm --filter @calchemy/date-react test
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

## Natural Language Pipeline

Prefer a deterministic, inspectable pipeline:

1. Build vocabulary lookups, including configured named dates.
2. Normalize and tokenize input: clean casing, whitespace, punctuation, aliases, articles, possessives, and known typos while recording corrections.
3. Standardize tokens into typed chunks such as weekdays, months, periods, connectors, ordinals, shorthands, commands, exclusions, and numbers.
4. Resolve context: apply the reference date plus locale, week-start, date-order preference, holiday provider, and relative-range options.
5. Parse numeric date candidates first. Return `valid` for one candidate or `ambiguous` with a date-order group for competing candidates.
6. Slice known language chunks into typed date intent: boundaries, relations, samplers, transforms, and exclusions.
7. Resolve the slice into concrete Temporal values by resolving boundaries, applying relations, sampling, transforming, excluding dates, and materializing a `DateValue`.
8. Return `valid` with the best candidate or `invalid` with structured errors and correction metadata.

Known grammar and phrase support should remain distinct from vocabulary aliases and fuzzy vocabulary correction.

## React Components

React should provide headless primitives and hooks:

- `Calchemy.Root`
- `Calchemy.Field`
- `Calchemy.InputMode`
- `Calchemy.Candidates`
- `Calchemy.Calendar`
- `useCalchemy`

Inline autocomplete belongs in `Calchemy.Field`. Pressing `Tab` should accept the active inline completion. `Candidates` and `Calendar` may be rendered inside popovers, but must not require a specific popover implementation.

## Effect Usage

Do not use `useEffect` to derive parser output, inline completion, candidates, calendar state, or form values from props/state. Calculate those during render or in `useCalchemy`, and use event handlers for typing, `Tab` completion, candidate selection, and calendar clicks. Effects are appropriate only for external synchronization such as DOM focus/measurement, global event listeners, timers, or integrations with non-React popover/positioning code; those Effects must include cleanup.

## Styling

Do not require Tailwind CSS. Components should be unstyled and expose state through props, render props, context, `data-*` attributes, and CSS variables where useful. Examples may demonstrate Tailwind, Panda CSS, and vanilla CSS independently.

# Coding Conventions and Style Guidelines

## TypeScript

- Use strict TypeScript.
- Prefer discriminated unions for parser results and date values.
- Keep exported types stable, documented, and intentionally named.
- Avoid `any`; use `unknown` and narrow when needed.

## API Naming

Prefer simple public names:

- `parseDate`
- `Calchemy`
- `useCalchemy`
- `DateValue`
- `ParseDateResult`

Avoid exposing internal terms like "expression" unless they clarify a specific type.

## Error Handling

Do not throw for normal invalid user input. Return structured invalid results. Reserve thrown errors for programmer mistakes, impossible states, or invalid configuration.

## Dependencies

Keep dependencies minimal. Parser behavior should be testable without React or browser APIs. Treat holiday providers, fuzzy matching, and styling integrations as optional layers.

# Testing Guidelines

## Parser Tests

Build the parser from a corpus of real phrases and expected results. Cover:

- Relative dates: `today`, `tomorrow`, `three weeks from now`.
- Ranges: `last 90 days`, `christmas 2026-Jul 1, 27`.
- Discrete dates: `all mon and sat until end of next month`.
- Exclusions: `excluding holidays`, `except tomorrow`, `skip next week`.
- Ambiguity: numeric dates, two-digit years, relative anchors.
- Typos and shorthand: month names, weekdays, common abbreviations.

Tests should fix the reference date, locale, week-start, and holiday calendars to avoid flaky results.

## React Tests

Test behavior, not styling. Cover:

- Input typing.
- Inline completion display and `Tab` acceptance.
- Candidate selection for ambiguous parses.
- Controlled and uncontrolled value flows.
- Form serialization.
- Keyboard accessibility.

## Accessibility

Follow WAI-ARIA guidance for combobox, dialog/popover, listbox, grid, and calendar interactions where applicable. Keyboard behavior is part of the public contract.

# General Instructions

- Parser semantics belong in `date-core`; UI packages should consume parser behavior through public core APIs.
- Keep React components independent from styling systems and popover libraries.
- Preserve ambiguity and candidate metadata so product UIs can explain choices.
- Prefer Temporal and canonical JSON over JavaScript `Date`.
- Keep examples separate from library internals.
- Before adding framework, build, or publishing code, check the official docs listed above.
- Do not introduce broad abstractions until tests show repeated complexity.
- When changing behavior, add or update parser corpus tests first.
- Use @.cursor/skills/writing/SKILL.md for writing documentation and README.
