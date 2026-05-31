# Panda CSS Example

Calchemy exposes unstyled components and `data-*` attributes, so Panda recipes can own the visual layer.

```tsx
<DateInput.Root calchemy={calchemy}>
  <DateInput.Field className={dateInputRecipe()} />
  <DateInput.Candidates className={candidateListRecipe()} />
  <DateInput.Calendar className={calendarRecipe()} />
</DateInput.Root>
```
