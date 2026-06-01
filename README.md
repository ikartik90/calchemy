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
@calchemy/date-core
@calchemy/date-react
```

`date-holidays` and `date-fuzzy` will become separate packages when those areas need independent ownership.

## Architecture

Calchemy keeps parsing and UI separate. `@calchemy/date-core` owns parser semantics, Temporal values, ambiguity, JSON, and form serialization. `@calchemy/date-react` renders parsed results through `useCalchemy` and the `Calchemy` primitives.

The parser follows an inspectable pipeline:

```txt
normalize -> tokenize -> correct -> parse -> resolve context -> expand -> rank -> detect ambiguity -> return result
```

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

`createCalchemy()` uses native `globalThis.Temporal` when the runtime supports Temporal and returns a Promise immediately. When Temporal is missing, `@js-temporal/polyfill` is dynamically imported as a fallback.

After setup, `calchemy.parseDate()` is synchronous.

## Ambiguity

Calchemy returns ambiguous parses with the choices your UI needs.

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
import { Calchemy } from "@calchemy/date-react";

const calchemy = await createCalchemy();

export function InvoiceFilter() {
  return (
    <Calchemy.Root calchemy={calchemy}>
      <Calchemy.Field placeholder="Try 'last 90 days'" />
      <Calchemy.Candidates />
      <Calchemy.Calendar />
    </Calchemy.Root>
  );
}
```

`Calchemy.Field` owns inline tab completion. `Calchemy.Candidates` renders parse choices. `Calchemy.Calendar` is optional.

## Styling examples

Style the headless primitives with plain CSS, recipes, utility classes, CSS Modules, or your own system.

### Vanilla CSS

```tsx
<Calchemy.Root calchemy={calchemy}>
  <Calchemy.Field className="date-field" />
  <div className="date-popover">
    <Calchemy.Candidates />
    <Calchemy.Calendar />
  </div>
</Calchemy.Root>
```

```css
.date-field {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 8px 10px;
}

[data-calchemy-candidate],
[data-calchemy-calendar-day] {
  background: transparent;
  border: 0;
  cursor: pointer;
}
```

### Panda CSS

```tsx
<Calchemy.Root calchemy={calchemy}>
  <Calchemy.Field className={dateInputRecipe()} />
  <Calchemy.Candidates className={candidateListRecipe()} />
  <Calchemy.Calendar className={calendarRecipe()} />
</Calchemy.Root>
```

### Tailwind

```tsx
<Calchemy.Root calchemy={calchemy}>
  <Calchemy.Field className="rounded-md border px-3 py-2" />
  <Calchemy.Candidates className="mt-2 grid gap-1" />
  <Calchemy.Calendar className="mt-2 grid grid-cols-7 gap-1" />
</Calchemy.Root>
```

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

Use Zod, Valibot, or your app's schema library for product rules.

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
