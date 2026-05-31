#!/usr/bin/env node

const DEFAULT_ANCHOR = "2026-05-27T12:00:00-04:00[America/New_York]";
const DEFAULT_LOCALE = "en-US";
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
const baseCalchemy = await calchemyModule.createCalchemy();
const { Temporal } = baseCalchemy;
const calchemy = await calchemyModule.createCalchemy({
  namedDatesVocabulary: [
    {
      value: "christmas",
      shortcuts: ["xmas"],
      resolveDate({ year, context }) {
        return context.anchor.toPlainDate().with({ year, month: 12, day: 25 });
      },
    },
    {
      value: "easter",
      shortcuts: [],
      resolveDate({ year }) {
        return getEasterDate(year, Temporal);
      },
    },
  ],
});

const context = {
  anchor: calchemy.Temporal.ZonedDateTime.from(
    options.anchor ?? process.env.CALCHEMY_ANCHOR ?? DEFAULT_ANCHOR,
  ),
  locale: options.locale ?? process.env.CALCHEMY_LOCALE ?? DEFAULT_LOCALE,
  weekStartsOn: parseWeekStartsOn(
    options.weekStartsOn ?? process.env.CALCHEMY_WEEK_STARTS_ON,
  ),
  dateOrderPreference: parseDateOrder(
    options.dateOrder ?? process.env.CALCHEMY_DATE_ORDER,
  ),
  holidays: {
    id: "dev-common-holidays",
    label: "Dev common holidays",
    includes(date) {
      return date.month === 12 && date.day === 25;
    },
  },
};

const result = calchemy.parseDate(input, context);

console.dir(
  {
    input,
    context: {
      anchor: context.anchor.toString(),
      locale: context.locale,
      weekStartsOn: context.weekStartsOn,
      dateOrderPreference: context.dateOrderPreference,
    },
    result: serializeResult(result, calchemy),
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
      flag === "--week-starts-on" ||
      flag === "--date-order"
    ) {
      const value = inlineValue ?? args[++index];
      if (!value) {
        throw new Error(`Missing value for ${flag}`);
      }

      if (flag === "--anchor") options.anchor = value;
      if (flag === "--locale") options.locale = value;
      if (flag === "--week-starts-on") options.weekStartsOn = value;
      if (flag === "--date-order") options.dateOrder = value;
      continue;
    }

    inputParts.push(arg);
  }

  return {
    input: inputParts.join(" ").trim(),
    options,
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

function getEasterDate(year, Temporal) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return Temporal.PlainDate.from({ year, month, day });
}

function printUsage() {
  console.log(`Usage:
  pnpm parse:date -- "next friday"
  pnpm parse:date -- --anchor "2026-05-27T12:00:00-04:00[America/New_York]" "last 90 days"

Options:
  --anchor <zoned-date-time>   Temporal ZonedDateTime anchor.
  --locale <locale>            Parser locale. Defaults to en-US.
  --week-starts-on <0-6>       0 is Sunday, 1 is Monday. Defaults to 0.
  --date-order <orders>        Comma-separated preference. Defaults to DMY,MDY,YMD.
`);
}
