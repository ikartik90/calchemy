# Calchemy

Calchemy is a headless date engine that parses natural language input. It turns phrases like `8 weeks from now` (single date), `Christmas 2026-Jul 1, 27` (date range), and `mondays and wednesdays next month` (multiple dates) into Temporal values.

## Install

```bash
# Core natural language date parsing engine
pnpm add @calchemy/date-core

# Optional headless react date-picker.
pnpm add @calchemy/date-react react
# Requires @calchemy/date-core.
# React 18.3+ or 19+ is a peer dependency.
```

When you import `@calchemy/date-react/calendar-scroll`, also install `react-dom` 18.3+ or 19+.

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

Setting `isHoliday: true` on an entry allows Calchemy to use it for parsing phrases like `excluding holidays` and holiday styling in the calendar.

## Using Date React (`@calchemy/date-react`)

Headless React primitives on top of `date-core`. You compose the field, candidate list, and calendar; Calchemy parses the query and keeps the value in sync.

```tsx
import { createCalchemy } from "@calchemy/date-core";
import { Calchemy } from "@calchemy/date-react";

const calchemy = await createCalchemy();

export function InvoiceFilter() {
  return (
    <Calchemy.Root calchemy={calchemy} expectedValue="range">
      <Calchemy.Field placeholder="Try 'last 90 days'" />
      <Calchemy.Candidates />
      <Calchemy.Calendar>
        <Calchemy.CalendarHeader>
          <Calchemy.CalendarPrevious />
          <Calchemy.CalendarHeading />
          <Calchemy.CalendarNext />
        </Calchemy.CalendarHeader>
        <Calchemy.CalendarWeekdays />
        <Calchemy.CalendarGrid />
      </Calchemy.Calendar>
    </Calchemy.Root>
  );
}
```

Put `Candidates` and `Calendar` in a popover, dialog, or inline panel. Calchemy does not ship a popover.

## Parts and styling

Parts forward props, including `ref`, to the underlying element. Each part exposes a `calchemy-*` attribute you can target in CSS. Nothing ships styled.

### Root

Wraps your field, candidates, and calendar in shared parser state. Set `expectedValue` to the kind of date your UI accepts.

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="range">
  <Calchemy.Field />
  <Calchemy.Candidates />
</Calchemy.Root>
```

Control the query with `inputValue` and `onInputValueChange`. Control the resolved date with `value` and `onValueChange`. Pass per-parse settings through `parseContext`.

`useCalchemy()` returns the same state if you want to build the UI yourself.

### Field `[calchemy-field]` `[calchemy-completions]`

The text input for natural language date query. The `[calchemy-field]` offers inline completions by setting `calchemy-has-completion` with values from `completionSources`. `[calchemy-field-backdrop]` holds `[calchemy-field-typed]` (invisible typed text) and `[calchemy-completions]` (ghost suffix).

```tsx
<Calchemy.Field placeholder="last 90 days" />
```

`getInputProps()` forwards `calchemy-status` (`valid`, `ambiguous`, `invalid`, or `kind-mismatch`) and `aria-description` with the composed suggestion. Set `renderInlineCompletion={false}` to turn off completions.

### Candidates `[calchemy-candidates]` `[calchemy-candidate]`

Renders choices when a phrase could mean more than one date, like `03/04/25`.

```tsx
<Calchemy.Candidates />
```

### InputMode `[calchemy-mode]`

Switches between typing in the field and picking on the calendar. `Root` owns the mode; pass `inputMode` and `onInputModeChange` to control it.

```tsx
<Calchemy.InputMode fieldLabel="Type" calendarLabel="Pick" />
```

In calendar mode the field is read-only and the calendar gets `calchemy-editable`.

### Calendar `[calchemy-calendar]`

Optional date grid. Skip the children and you get a default header, weekday row, and month grid.

```tsx
<Calchemy.Calendar period={{ months: 2 }}>
  <Calchemy.CalendarHeader>
    <Calchemy.CalendarPrevious />
    <Calchemy.CalendarHeading />
    <Calchemy.CalendarNext />
  </Calchemy.CalendarHeader>
  <Calchemy.CalendarWeekdays />
  <Calchemy.CalendarGrid />
</Calchemy.Calendar>
```

`bounds` keeps navigation and selection inside a range. `isDateDisabled` greys out specific days. `namedDates="holidays"` marks days from your `namedDatesVocabulary`.

### CalendarGrid `[calchemy-grid]` `[calchemy-date]` `[calchemy-selected?]` `[calchemy-today?]`

The month grid. `showBookends` fills leading and trailing cells with adjacent-month days. In calendar input mode, click or drag to toggle multiple dates.

```css
[calchemy-date][calchemy-selected] {
  background: #111;
  color: white;
}
```

### CalendarScroll `[calchemy-scroll]`

Import from `@calchemy/date-react/calendar-scroll`. Requires `react-dom` 18.3+ or 19+ as a peer dependency. Wrap `CalendarPeriodList` to load more months as the user scrolls.

```tsx
import { CalendarScroll } from "@calchemy/date-react/calendar-scroll";

<Calchemy.Calendar period={{ months: 3 }}>
  <CalendarScroll direction="horizontal">
    <Calchemy.CalendarPeriodList>
      <Calchemy.CalendarPeriod>
        <Calchemy.CalendarGrid />
      </Calchemy.CalendarPeriod>
    </Calchemy.CalendarPeriodList>
  </CalendarScroll>
</Calchemy.Calendar>;
```

### `useCalchemyCalendar()`

Use inside `Calchemy.Calendar` when you want your own month or year controls.

```tsx
const calendar = useCalchemyCalendar();

calendar.setPeriodAnchor(
  calendar.visiblePeriodAnchor.with({ month: 6, day: 1 }),
);
```

## Examples

### Controlled field

```tsx
<Calchemy.Root
  calchemy={calchemy}
  expectedValue="range"
  inputValue={query}
  onInputValueChange={setQuery}
  value={value}
  onValueChange={setValue}
  parseContext={{ locale: "en-US", weekStartsOn: 1 }}
>
  <Calchemy.Field placeholder="Try 'next week'" />
  <Calchemy.Candidates />
</Calchemy.Root>
```

### Bounds and disabled dates

```tsx
<Calchemy.Calendar
  bounds={{ start: today, end: today.add({ months: 6 }) }}
  isDateDisabled={(date) => date.dayOfWeek === 6 || date.dayOfWeek === 7}
>
  <Calchemy.CalendarGrid />
</Calchemy.Calendar>
```

### Named dates on the calendar

```tsx
<Calchemy.Calendar namedDates="holidays">
  <Calchemy.CalendarGrid />
</Calchemy.Calendar>
```

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

Calchemy keeps parsing and UI separate. `@calchemy/date-core` owns parser semantics, Temporal values, ambiguity, JSON, and form serialization. `@calchemy/date-react` renders parsed results through `useCalchemy` and the `Calchemy` primitives.

Here's how the parser interprets natural-language dates:

1. Normalize and tokenize: Cleans the input and splits it into typed tokens
2. Standardize chunks: Classifies the tokens into typed semantic chunks
3. Resolve context: Applies reference date, locale, and preferences
4. Resolve ambiguity: Surfaces competing numeric date interpretations
5. Slice and group: Identifies boundaries, relations, samplers, and exclusions
6. Resolve values: Computes concrete Temporal values over qualifier boundaries
7. Return result: Returns status, Temporal value, candidates, and corrections
