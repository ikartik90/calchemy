# Vanilla CSS Example

Use Calchemy components without a styling dependency.

```tsx
<DateInput.Root calchemy={calchemy}>
  <DateInput.Field className="date-field" />
  <div className="date-popover">
    <DateInput.Candidates />
    <DateInput.Calendar />
  </div>
</DateInput.Root>
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
