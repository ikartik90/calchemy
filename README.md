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
    <Calchemy.Root calchemy={calchemy} expectedValue="range">
      <Calchemy.Field placeholder="Try 'last 90 days'" />
      <Calchemy.Candidates />
      <Calchemy.Calendar>
        <Calchemy.CalendarHeader>
          <Calchemy.CalendarPrevious pageSize={{ months: 1 }} />
          <Calchemy.CalendarHeading />
          <Calchemy.CalendarNext pageSize={{ months: 1 }} />
        </Calchemy.CalendarHeader>
        <Calchemy.CalendarWeekdays />
        <Calchemy.CalendarGrid />
      </Calchemy.Calendar>
    </Calchemy.Root>
  );
}
```

`Calchemy.Field` owns inline tab completion. `Calchemy.Candidates` renders parse choices. `Calchemy.Calendar` is optional and renders headless calendar parts.

### React state

`Calchemy.Root` wraps the `useCalchemy` hook. Set `expectedValue` to the value kind your field accepts: `single`, `range`, or `multiple`. Pass controlled props when your app owns the input or selected value, or use `defaultInputValue` and `defaultValue` for local state.

```tsx
<Calchemy.Root
  calchemy={calchemy}
  expectedValue="range"
  inputValue={query}
  onInputValueChange={setQuery}
  value={value}
  onValueChange={setValue}
  parseContext={{
    locale: "en-US",
    weekStartsOn: 1,
  }}
>
  <Calchemy.Field placeholder="Try 'next week'" />
  <Calchemy.Candidates />
</Calchemy.Root>
```

Use `useCalchemy()` directly when you want the parser state without the component tree.

### Calendar periods

`Calchemy.Calendar` renders one visible month by default. Use the `period` prop to render months or weeks in larger windows.

```tsx
<Calchemy.Calendar period={{ months: 3 }}>
  <Calchemy.CalendarHeader>
    <Calchemy.CalendarPrevious pageSize={{ months: 3 }} />
    <Calchemy.CalendarHeading />
    <Calchemy.CalendarNext pageSize={{ months: 3 }} />
  </Calchemy.CalendarHeader>

  <Calchemy.CalendarMonthSelect aria-label="Month" />
  <Calchemy.CalendarYearSelect aria-label="Year" />

  <Calchemy.CalendarPeriodList>
    <Calchemy.CalendarPeriod>
      <Calchemy.CalendarPeriodHeading />
      <Calchemy.CalendarWeekdays />
      <Calchemy.CalendarGrid showBookends />
    </Calchemy.CalendarPeriod>
  </Calchemy.CalendarPeriodList>
</Calchemy.Calendar>
```

Calendar parts are composable:

- `CalendarHeading` labels the current visible period window and accepts custom children.
- `CalendarPrevious` and `CalendarNext` move by `pageSize` from the current visible period, including after scroll.
- `CalendarMonthSelect` and `CalendarYearSelect` are native select controls. Their values are strings at the DOM boundary and numbers when updating Temporal dates.
- `CalendarWeekdays` uses `parseContext.weekStartsOn`.
- `CalendarGrid` selects dates on click and can render outside-month bookend days with `showBookends`.

For `expectedValue="multiple"`, `CalendarGrid` supports click and drag toggling. A click toggles one day. A drag toggles every enabled day cell intersecting the drag rectangle: unselected dates become selected, selected dates become deselected, and dates outside the rectangle keep their current state.

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="multiple">
  <Calchemy.Calendar>
    <Calchemy.CalendarWeekdays />
    <Calchemy.CalendarGrid />
  </Calchemy.Calendar>
</Calchemy.Root>
```

`period` and `pageSize` use Temporal-style duration objects:

```tsx
<Calchemy.Calendar period={{ months: 3 }}>
  <Calchemy.CalendarPrevious pageSize={{ months: 1 }} />
  <Calchemy.CalendarNext pageSize={{ months: 1 }} />
</Calchemy.Calendar>
```

### Calendar constraints

Use `bounds` to cap calendar operation. Navigation, scrolling, preloading, generated periods, and date selection stay inside the range.

```tsx
function BookingCalendar() {
  const state = useCalchemyContext();
  const today =
    state.parseContext?.anchor?.toPlainDate() ??
    state.calchemy.Temporal.Now.plainDateISO();

  return (
    <Calchemy.Calendar
      period={{ months: 3 }}
      bounds={{
        start: today,
        end: today.add({ months: 6 }),
      }}
    >
      <Calchemy.CalendarHeader>
        <Calchemy.CalendarPrevious pageSize={{ months: 1 }} />
        <Calchemy.CalendarHeading />
        <Calchemy.CalendarNext pageSize={{ months: 1 }} />
      </Calchemy.CalendarHeader>
      <Calchemy.CalendarGrid />
    </Calchemy.Calendar>
  );
}
```

Use `isDateDisabled` for dates that should remain visible but cannot be selected.

```tsx
<Calchemy.Calendar
  isDateDisabled={(date) => date.dayOfWeek === 6 || date.dayOfWeek === 7}
>
  <Calchemy.CalendarGrid />
</Calchemy.Calendar>
```

Disabled days render with `disabled` and `data-disabled`. Days outside `bounds` also receive `data-out-of-bounds`.

Named-date styling uses the same `NamedDatesVocabularyEntry` records passed to `createCalchemy()`.

```tsx
const calchemy = await createCalchemy({
  namedDatesVocabulary: [
    {
      value: "company holiday",
      isHoliday: true,
      resolveDate({ year, context }) {
        return context.anchor.toPlainDate().with({ year, month: 12, day: 25 });
      },
    },
  ],
});

<Calchemy.Root calchemy={calchemy} expectedValue="single">
  <Calchemy.Calendar namedDates="holidays">
    <Calchemy.CalendarGrid />
  </Calchemy.Calendar>
</Calchemy.Root>;
```

Use `namedDates="all"` to expose all configured named dates or `namedDates="holidays"` to expose entries with `isHoliday: true`. Matching days receive `data-named-date`; holiday matches also receive `data-holiday`.

### Scrollable calendars

Wrap `CalendarPeriodList` in `CalendarScroll` to preload periods as the user scrolls. The scroll direction defaults to vertical.

```tsx
<Calchemy.Calendar period={{ months: 3 }}>
  <Calchemy.CalendarHeader>
    <Calchemy.CalendarHeading />
  </Calchemy.CalendarHeader>

  <Calchemy.CalendarScroll direction="horizontal">
    <Calchemy.CalendarPeriodList>
      <Calchemy.CalendarPeriod>
        <Calchemy.CalendarPeriodHeading />
        <Calchemy.CalendarWeekdays />
        <Calchemy.CalendarGrid />
      </Calchemy.CalendarPeriod>
    </Calchemy.CalendarPeriodList>
  </Calchemy.CalendarScroll>
</Calchemy.Calendar>
```

For vertical scrolling, give the scroll element a block-size or max-block-size. Without a height constraint, the page scrolls because the calendar grows to fit its content.

```css
[data-calchemy-scroll][data-direction="vertical"] {
  max-block-size: 32rem;
  overflow-y: auto;
}

[data-calchemy-scroll][data-direction="horizontal"] [data-calchemy-period-list] {
  display: grid;
  grid-auto-columns: calc((100% - 2rem) / 3);
  grid-auto-flow: column;
  gap: 1rem;
}
```

`CalendarHeading`, `CalendarPrevious`, `CalendarNext`, `CalendarMonthSelect`, and `CalendarYearSelect` follow the current visible period while scrolling.

### Custom calendar controls

Use `useCalchemyCalendar()` inside `Calchemy.Calendar` when you want custom controls, including Radix UI selects or your own dropdown.

```tsx
import * as Select from "@radix-ui/react-select";
import { useCalchemyCalendar } from "@calchemy/date-react";

function MonthDropdown() {
  const calendar = useCalchemyCalendar();
  const current = calendar.visiblePeriodAnchor;

  return (
    <Select.Root
      value={String(current.month)}
      onValueChange={(value) => {
        calendar.setPeriodAnchor(
          current.with({ month: Number(value), day: 1 }),
        );
      }}
    >
      <Select.Trigger aria-label="Month">
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper">
          <Select.Viewport>
            {Array.from({ length: 12 }, (_, index) => {
              const month = index + 1;
              const date = current.with({ month, day: 1 });

              return (
                <Select.Item key={month} value={String(month)}>
                  <Select.ItemText>
                    {date.toLocaleString(calendar.locale, { month: "long" })}
                  </Select.ItemText>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
```

Use `calendar.visiblePeriodAnchor` for controls that should follow scrolling. Use `calendar.setPeriodAnchor()` to jump to a new month or year.

## Styling examples

Style the headless primitives with plain CSS, recipes, utility classes, CSS Modules, or your own system.

### Vanilla CSS

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="range">
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
[data-calchemy-day] {
  background: transparent;
  border: 0;
  cursor: pointer;
}

[data-calchemy-day][data-selected] {
  background: #111;
  color: white;
}

[data-calchemy-day][data-today] {
  outline: 1px solid currentColor;
}
```

### Panda CSS

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="range">
  <Calchemy.Field className={dateInputRecipe()} />
  <Calchemy.Candidates className={candidateListRecipe()} />
  <Calchemy.Calendar className={calendarRecipe()} />
</Calchemy.Root>
```

### Tailwind

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="range">
  <Calchemy.Field className="rounded-md border px-3 py-2" />
  <Calchemy.Candidates className="mt-2 grid gap-1" />
  <Calchemy.Calendar className="mt-2" />
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
