# Architecture

Calchemy keeps parsing and UI separate.

```txt
@calchemy/date-core
  normalize -> tokenize -> correct -> parse -> resolve context -> expand -> rank -> detect ambiguity -> return result

@calchemy/date-react
  useDateInput -> DateInput primitives -> user styling and popover composition
```

`date-core` owns parser semantics, Temporal values, ambiguity, JSON, and form serialization. `date-react` consumes `date-core`; it does not parse dates itself.

## Temporal loading

`createCalchemy()` uses native `globalThis.Temporal` when it exists. If Temporal is missing, it dynamically imports `@js-temporal/polyfill`.

Use `createCalchemyWithTemporal(Temporal)` when you want full control over the Temporal implementation.

## Validation boundary

Calchemy validates its own wire format with small guards. Apps validate product rules with their own schema tools.
