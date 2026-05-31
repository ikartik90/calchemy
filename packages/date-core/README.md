# @calchemy/date-core

Natural language date parsing with Temporal values.

## Temporal loading

`createCalchemy()` uses native `globalThis.Temporal` when the runtime supports Temporal. When Temporal is missing, `@js-temporal/polyfill` is dynamically imported as a fallback.

After setup, parsing is synchronous:

```ts
import { createCalchemy } from "@calchemy/date-core";

const calchemy = await createCalchemy();
const result = calchemy.parseDate("last 90 days");
```

