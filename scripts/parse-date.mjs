#!/usr/bin/env node

const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "America/New_York";
const DEFAULT_WEEK_STARTS_ON = 0;
const DEFAULT_DATE_ORDER = ["DMY", "MDY", "YMD"];

const { input, options } = parseCliArgs(process.argv.slice(2));

if (!input || options.help) {
  printUsage();
  process.exit(input ? 0 : 1);
}

const moduleUrl = new URL(
  "../packages/date-core/dist/index.js",
  import.meta.url,
);
const calchemyModule = await importBuiltCore(moduleUrl);
const namedDatesVocabulary = [
  {
    value: "christmas",
    shortcuts: ["xmas"],
    isHoliday: true,
    resolveDate({ year, context }) {
      return context.anchor.toPlainDate().with({ year, month: 12, day: 25 });
    },
  },
  {
    value: "independence day",
    shortcuts: [],
    isHoliday: true,
    resolveDate({ year, context }) {
      return context.anchor.toPlainDate().with({ year, month: 7, day: 4 });
    },
  },
];
const calchemy = await calchemyModule.createCalchemy({
  namedDatesVocabulary,
});

const contextBase = {
  anchor: resolveAnchor(calchemy.Temporal, options),
  locale: options.locale ?? process.env.CALCHEMY_LOCALE ?? DEFAULT_LOCALE,
  weekStartsOn: parseWeekStartsOn(
    options.weekStartsOn ?? process.env.CALCHEMY_WEEK_STARTS_ON,
  ),
  dateOrderPreference: parseDateOrder(
    options.dateOrder ?? process.env.CALCHEMY_DATE_ORDER,
  ),
};
const context = {
  ...contextBase,
  holidays: createNamedDateHolidayProvider(namedDatesVocabulary, contextBase),
};

const result = calchemy.parseDate(input, context);
const expectedKind = parseExpectedKind(options.expect);
const resolvedResult = expectedKind
  ? calchemyModule.resolveExpectedDateValue(result, expectedKind)
  : result;
const serializedResult = serializeResult(resolvedResult, calchemy);

if (expectedKind) {
  console.dir(
    resolvedResult.status === "valid"
      ? serializedResult.value
      : serializedResult,
    {
      depth: null,
      colors: process.stdout.isTTY,
    },
  );
  process.exit(0);
}

console.dir(
  {
    input,
    context: {
      anchor: context.anchor.toString(),
      locale: context.locale,
      weekStartsOn: context.weekStartsOn,
      dateOrderPreference: context.dateOrderPreference,
    },
    result: serializedResult,
  },
  { depth: null, colors: process.stdout.isTTY },
);

async function importBuiltCore(moduleUrl) {
  try {
    return await import(moduleUrl.href);
  } catch (error) {
    if (error && error.code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        "Could not load date-core from packages/date-core/dist/index.js.",
      );
      console.error("Run `pnpm build` before using this dev script.");
      process.exit(1);
    }

    throw error;
  }
}

function serializeResult(result, calchemy) {
  if (result.status === "valid") {
    return {
      ...result,
      value: calchemy.toJSON(result.value),
      candidates: result.candidates.map((candidate) =>
        serializeCandidate(candidate, calchemy),
      ),
    };
  }

  if (result.status === "ambiguous") {
    return {
      ...result,
      candidates: result.candidates.map((candidate) =>
        serializeCandidate(candidate, calchemy),
      ),
    };
  }

  return result;
}

function serializeCandidate(candidate, calchemy) {
  return {
    ...candidate,
    value: calchemy.toJSON(candidate.value),
  };
}

function parseCliArgs(args) {
  const options = {};
  const inputParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    const [flag, inlineValue] = arg.split("=", 2);
    if (
      flag === "--anchor" ||
      flag === "--locale" ||
      flag === "--time-zone" ||
      flag === "--week-starts-on" ||
      flag === "--date-order" ||
      flag === "--expect"
    ) {
      const value = inlineValue ?? args[++index];
      if (!value) {
        throw new Error(`Missing value for ${flag}`);
      }

      if (flag === "--anchor") options.anchor = value;
      if (flag === "--locale") options.locale = value;
      if (flag === "--time-zone") options.timeZone = value;
      if (flag === "--week-starts-on") options.weekStartsOn = value;
      if (flag === "--date-order") options.dateOrder = value;
      if (flag === "--expect") options.expect = value;
      continue;
    }

    inputParts.push(arg);
  }

  return {
    input: inputParts.join(" ").trim(),
    options,
  };
}

function parseExpectedKind(value) {
  if (value === undefined) {
    return null;
  }

  if (value === "single" || value === "multiple" || value === "range") {
    return value;
  }

  throw new Error("--expect must be one of: single, multiple, range.");
}

function resolveAnchor(Temporal, options) {
  const anchor = options.anchor ?? process.env.CALCHEMY_ANCHOR;
  if (anchor) {
    return Temporal.ZonedDateTime.from(anchor);
  }

  return Temporal.Now.zonedDateTimeISO(
    options.timeZone ?? process.env.CALCHEMY_TIME_ZONE ?? DEFAULT_TIME_ZONE,
  );
}

function createNamedDateHolidayProvider(namedDatesVocabulary, context) {
  const holidayEntries = namedDatesVocabulary.filter(
    (entry) => entry.isHoliday,
  );

  return {
    id: "dev-named-date-holidays",
    label: "Dev named-date holidays",
    includes(date) {
      return holidayEntries.some((entry) => {
        const holiday = entry.resolveDate({ year: date.year, context });
        return holiday?.equals(date) ?? false;
      });
    },
  };
}

function parseWeekStartsOn(value) {
  if (value === undefined) {
    return DEFAULT_WEEK_STARTS_ON;
  }

  const weekday = Number(value);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(
      "--week-starts-on must be an integer from 0 (Sunday) to 6 (Saturday).",
    );
  }

  return weekday;
}

function parseDateOrder(value) {
  if (value === undefined) {
    return DEFAULT_DATE_ORDER;
  }

  const orders = value.split(",").map((order) => order.trim().toUpperCase());
  const validOrders = new Set(["DMY", "MDY", "YMD"]);

  if (orders.length === 0 || orders.some((order) => !validOrders.has(order))) {
    throw new Error(
      "--date-order must be a comma-separated list containing DMY, MDY, and/or YMD.",
    );
  }

  return orders;
}

function printUsage() {
  console.log(`Usage:
  pnpm parse-date:single -- "next friday"
  pnpm parse-date:multiple -- "first 10 days of the next month excluding holidays"
  pnpm parse-date:range -- --anchor "2026-05-27T12:00:00-04:00[America/New_York]" "last 90 days"

Options:
  --anchor <zoned-date-time>   Temporal ZonedDateTime anchor.
  --time-zone <iana-zone>       Time zone for the default current-time anchor. Defaults to America/New_York.
  --locale <locale>            Parser locale. Defaults to en-US.
  --week-starts-on <0-6>       0 is Sunday, 1 is Monday. Defaults to 0.
  --date-order <orders>        Comma-separated preference. Defaults to DMY,MDY,YMD.
  --expect <kind>               Internal script mode: single, multiple, or range.
`);
}
