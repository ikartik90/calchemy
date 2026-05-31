# Calchemy parses dates people type

Calchemy is a natural language date engine with headless React components. It turns phrases like `three weeks from now`, `last 90 days`, and `Christmas 2026-Jul 1, 27` into Temporal values.

The parser returns structured results:

- A single date.
- A date range.
- Multiple discrete dates.
- An ambiguous result when the phrase has more than one plausible meaning.
- An invalid result when Calchemy needs clearer input.

## Packages

```txt
@calchemy/date-core   parser, Temporal values, ambiguity, JSON, and form values
@calchemy/date-react  headless React primitives and hooks
```

`date-holidays` and `date-fuzzy` will become separate packages when those areas need independent ownership.

## Core usage

```ts
import { createCalchemy } from "@calchemy/date-core";

const calchemy = await createCalchemy();

const result = calchemy.parseDate("last 90 days", {
  anchor: calchemy.Temporal.ZonedDateTime.from(
    "2026-05-27T12:00:00-04:00[America/New_York]",
  ),
  locale: "en-US",
  weekStartsOn: 0,
  dateOrderPreference: ["DMY", "MDY", "YMD"],
});

if (result.status === "valid") {
  console.log(calchemy.toJSON(result.value));
}
```

`createCalchemy()` returns a Promise immediately. It uses native `globalThis.Temporal` when the runtime supports Temporal. When Temporal is missing, `@js-temporal/polyfill` is dynamically imported as a fallback.

After setup, `calchemy.parseDate()` is synchronous.

## Ambiguity

Calchemy treats ambiguity as a result, not an error.

```ts
const result = calchemy.parseDate("03/04/25");

if (result.status === "ambiguous") {
  for (const candidate of result.candidates) {
    console.log(candidate.label);
  }
}
```

That input can mean March 4, 2025, or April 3, 2025. Your UI can show both choices instead of guessing.

## React usage

```tsx
import { createCalchemy } from "@calchemy/date-core";
import { DateInput } from "@calchemy/date-react";

const calchemy = await createCalchemy();

export function InvoiceFilter() {
  return (
    <DateInput.Root calchemy={calchemy}>
      <DateInput.Field placeholder="Try 'last 90 days'" />
      <DateInput.Candidates />
      <DateInput.Calendar />
    </DateInput.Root>
  );
}
```

`DateInput.Field` owns inline tab completion. `DateInput.Candidates` renders choices for ambiguous parses. `DateInput.Calendar` is optional.

The components are unstyled. Use vanilla CSS, Panda CSS, Tailwind, CSS Modules, or your own system.

## Form and JSON values

Calchemy uses Temporal objects at runtime and plain values at boundaries.

```ts
const formValue = calchemy.toFormValue(result.value);
const jsonValue = calchemy.toJSON(result.value);
```

Canonical form values:

```txt
single:   2026-12-25
range:    2026-12-25/2027-07-01
multiple: 2026-12-25,2026-12-28,2027-01-01
```

Canonical JSON values:

```ts
type DateValueJSON =
  | { kind: "single"; date: string }
  | { kind: "range"; start: string; end: string }
  | { kind: "multiple"; dates: string[] };
```

## Bring your own schema validator

Calchemy does not depend on Zod, Valibot, or another schema library.

The package validates its own wire format with lightweight guards:

```ts
import { isDateValueJSON } from "@calchemy/date-core";

if (isDateValueJSON(value, calchemy.Temporal)) {
  const dateValue = calchemy.fromJSON(value);
}
```

Validate product rules in your app:

- Required fields.
- Maximum range length.
- Past-date rules.
- Weekend rules.
- Allowed value kinds.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Use package filters while working:

```bash
pnpm --filter @calchemy/date-core test
pnpm --filter @calchemy/date-react test
```
