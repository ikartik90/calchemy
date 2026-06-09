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

## Install

```bash
pnpm add @calchemy/date-react react
```

`@calchemy/date-core` installs with `@calchemy/date-react`. Import it directly when creating a `Calchemy` instance. `@calchemy/date-react` depends on `@js-temporal/polyfill` through `date-core` and loads it when native `globalThis.Temporal` is missing. React 18.3+ or 19+ is a peer dependency.

When you import `@calchemy/date-react/calendar-scroll`, also install `react-dom` 18.3+ or 19+.

## Architecture

Calchemy keeps parsing and UI separate. `@calchemy/date-core` owns parser semantics, Temporal values, ambiguity, JSON, and form serialization. `@calchemy/date-react` renders parsed results through `useCalchemy` and the `Calchemy` primitives.

The parser follows an inspectable pipeline:

```txt
vocabulary -> normalize and tokenize -> standardize chunks -> resolve context -> numeric candidates -> slice language -> resolve values -> return result
```

Supported phrase families include relative anchors (`today`, `next friday`), calendar periods (`Q1`, `w52`, `this month`), counted ranges (`last 90 days`, `next 3 fridays`), connectors (`between`, `until`), samplers (`every monday`, `all odd numbered dates in december`), exclusions (`excluding holidays`, `skip weekends`), date math (`next monday in march + 2 weeks`), named dates (with vocabulary), and shorthand correction (`tmrw`, `xmas`). Phrases like `christmas` require `namedDatesVocabulary` at setup.

## Core usage

```ts
import { createCalchemy } from "@calchemy/date-core";

const calchemy = await createCalchemy();

const result = calchemy.parseDate("last 90 days", {
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

### Time zone and reference date

Relative phrases like `today`, `tomorrow`, and `last 90 days` resolve against a reference calendar date. Set `timeZone` for live parsing in a specific zone, or `referenceDate` to pin an as-of date (tests, replays):

```ts
const calchemy = await createCalchemy({
  defaultContext: {
    timeZone: "America/New_York",
  },
});
```

```ts
const result = calchemy.parseDate("today", {
  referenceDate: Temporal.PlainDate.from("2026-05-27"),
});
```

When both are set, `referenceDate` wins. Use `defaultContext` at factory time to apply the same settings to every parse.

### Configuration

`createCalchemy()` accepts factory options:

- `defaultContext` sets default `ParseDateContext` for every parse.
- `completionSources` drives inline Tab completion. Parser vocabulary is not auto-completed.
- `namedDatesVocabulary` registers named dates for parsing and calendar styling.

Per-parse `ParseDateContext` fields:

- `locale` for candidate and calendar label formatting.
- `weekStartsOn`, `dateOrderPreference`.
- `timeZone` and `referenceDate` for relative phrases (see Time zone and reference date above).
- `holidays` as a `HolidayProvider` for `excluding holidays` and similar phrases.
- `lastNDaysIncludesToday` controls whether `last N days` and `past N days` include today (default `true`).

```ts
const calchemy = await createCalchemy({
  defaultContext: { locale: "en-US", weekStartsOn: 1, dateOrderPreference: ["MDY", "DMY"] },
  completionSources: [{ id: "phrases", entries: [{ value: "previous 90 days" }] }],
  namedDatesVocabulary: [
    {
      value: "christmas",
      shortcuts: ["xmas"],
      resolveDate({ year, context }) {
        return context.referenceDate.with({ year, month: 12, day: 25 });
      },
    },
  ],
});
```

### Parse results

Every result includes `input`, `corrections` (typo, shorthand, and alias fixes), and `warnings`.

`valid` adds `value`, `candidates`, and `warnings` (for example `maximum-selectable-dates-exceeded` when coercing a range to multiple dates).

`ambiguous` adds `candidates` and `ambiguityGroups`. Today only `date-order` ambiguity is produced (for example `03/04/25` as March 4 vs April 3 vs 2003-04-25). Other ambiguity kinds exist in the type system for future use.

`invalid` adds `errors` with codes like `empty-input`, `unsupported-expression`, `invalid-date`, `invalid-context`, and `unexpected-value-kind`.

```ts
const result = calchemy.parseDate("03/04/25");

if (result.status === "ambiguous") {
  for (const group of result.ambiguityGroups) {
    console.log(group.message);
  }
  for (const candidate of result.candidates) {
    console.log(candidate.label);
  }
}

if (result.status === "invalid") {
  console.log(result.errors[0]?.message);
}
```

That input can mean March 4, 2025, April 3, 2025, or 2003-04-25. Your UI can show the choices instead of guessing.

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

`Calchemy.Field` owns inline tab completion from `completionSources`. `Calchemy.Candidates` renders parse choices. `Calchemy.Calendar` is optional; without children it renders a default header, weekdays row, and grid.

### React state

`Calchemy.Root` wraps the `useCalchemy` hook. Set `expectedValue` to the value kind your field accepts: `single`, `range`, or `multiple`. Pass controlled props when your app owns the input or selected value, or use `defaultInputValue` and `defaultValue` for local state.

`useCalchemy` resolves parses against `expectedValue`. A range typed into a `single` field stays invalid; `single` and `range` parses coerce to `multiple` when needed. Range-to-multiple expansion caps at `multipleRangeExpansionLimit` (default 1095). When the parse succeeds but the value kind does not match, the field reports `data-status="kind-mismatch"` and `aria-invalid`.

```tsx
<Calchemy.Root
  calchemy={calchemy}
  expectedValue="range"
  inputValue={query}
  onInputValueChange={setQuery}
  value={value}
  onValueChange={setValue}
  multipleRangeExpansionLimit={365}
  parseContext={{
    locale: "en-US",
    weekStartsOn: 1,
  }}
>
  <Calchemy.Field placeholder="Try 'next week'" />
  <Calchemy.Candidates />
</Calchemy.Root>
```

`onValueChange` receives the resolved `DateValue` and the full `ParseDateResult`. `Calchemy.Candidates` filters choices to the expected kind for `single` and `range` fields.

Use `useCalchemy()` directly when you want the parser state without the component tree.

### Calendar periods

`Calchemy.Calendar` renders one visible month by default. Use `period` to render multiple months or weeks. `pageSize` on navigation controls uses the same shape: `{ months: n }` or `{ weeks: n }`.

```tsx
<Calchemy.Calendar period={{ months: 3 }}>
  <Calchemy.CalendarHeader>
    <Calchemy.CalendarPrevious pageSize={{ months: 3 }} />
    <Calchemy.CalendarHeading />
    <Calchemy.CalendarNext pageSize={{ months: 3 }} />
  </Calchemy.CalendarHeader>

  <Calchemy.CalendarMonthSelect aria-label="Month" />
  <Calchemy.CalendarYearSelect aria-label="Year" startYear={2024} endYear={2030} />

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
- `CalendarMonthSelect` and `CalendarYearSelect` are native select controls. `CalendarYearSelect` accepts `startYear` and `endYear`. Values are strings at the DOM boundary and numbers when updating Temporal dates.
- `CalendarWeekdays` uses `parseContext.weekStartsOn`.
- `CalendarGrid` selects dates on click, accepts `showBookends` for outside-month days, and `dragSelection` (default `true`) for multiple-date drag toggling.

For `expectedValue="multiple"`, `CalendarGrid` supports click and drag toggling. A click toggles one day. A drag toggles every enabled day cell intersecting the drag rectangle: unselected dates become selected, selected dates become deselected, and dates outside the rectangle keep their current state.

```tsx
<Calchemy.Root calchemy={calchemy} expectedValue="multiple">
  <Calchemy.Calendar>
    <Calchemy.CalendarWeekdays />
    <Calchemy.CalendarGrid dragSelection />
  </Calchemy.Calendar>
</Calchemy.Root>
```

### Calendar constraints

Use `bounds` to cap calendar operation. Navigation, scrolling, preloading, generated periods, and date selection stay inside the range.

```tsx
function BookingCalendar() {
  const state = useCalchemyContext();
  const today =
    state.parseContext?.referenceDate ??
    state.calchemy.Temporal.Now.plainDateISO(state.parseContext?.timeZone);

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

Use `isDateDisabled` for dates that should remain visible but cannot be selected. The callback receives the date and calendar state.

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
        return context.referenceDate.with({ year, month: 12, day: 25 });
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

Use `namedDates="all"` to expose all configured named dates or `namedDates="holidays"` to expose entries with `isHoliday: true`. Matching days receive `data-named-date` and `data-named-date-labels`; holiday matches also receive `data-holiday`.

### Scrollable calendars

Wrap `CalendarPeriodList` in `CalendarScroll` to preload periods as the user scrolls. Import scroll from the subpath; it requires `react-dom`. The scroll direction defaults to vertical.

```tsx
import { Calchemy } from "@calchemy/date-react";
import { CalendarScroll } from "@calchemy/date-react/calendar-scroll";

<Calchemy.Calendar period={{ months: 3 }}>
  <Calchemy.CalendarHeader>
    <Calchemy.CalendarHeading />
  </Calchemy.CalendarHeader>

  <CalendarScroll direction="horizontal">
    <Calchemy.CalendarPeriodList>
      <Calchemy.CalendarPeriod>
        <Calchemy.CalendarPeriodHeading />
        <Calchemy.CalendarWeekdays />
        <Calchemy.CalendarGrid />
      </Calchemy.CalendarPeriod>
    </Calchemy.CalendarPeriodList>
  </CalendarScroll>
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

## Styling

Style the headless primitives with plain CSS, recipes, utility classes, CSS Modules, or your own system. Components expose `className` and `data-*` hooks.

### Data attributes

Field: `data-calchemy-field`, `data-calchemy-inline-completion`. Input props from `getInputProps()`: `data-status` (`valid`, `ambiguous`, `invalid`, `kind-mismatch`), `data-expected-value`, `data-value-kind`.

Candidates: `data-calchemy-candidates`, `data-calchemy-candidate`.

Calendar shell: `data-calchemy-calendar`, `data-calchemy-header`, `data-calchemy-heading`, `data-calchemy-previous`, `data-calchemy-next`, `data-calchemy-month-select`, `data-calchemy-year-select`.

Grid: `data-calchemy-weekdays`, `data-calchemy-weekday`, `data-weekend`, `data-calchemy-grid`, `data-calchemy-week`, `data-calchemy-cell`, `data-blank`, `data-calchemy-day`, `data-selected`, `data-today`, `data-outside`, `data-first-of-period`, `data-last-of-period`, `data-disabled`, `data-out-of-bounds`, `data-named-date`, `data-holiday`, `data-named-date-labels`.

Multiple drag: `data-multiple-drag`, `data-dragging`, `data-drag-preview`, `data-drag-preview-selected`, `data-drag-preview-deselected`, `data-calchemy-drag-rect`.

Periods and scroll: `data-calchemy-period`, `data-period-id`, `data-period-index`, `data-calchemy-period-heading`, `data-calchemy-period-list`, `data-calchemy-scroll`, `data-direction`, `data-calchemy-scroll-spacer`.

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
