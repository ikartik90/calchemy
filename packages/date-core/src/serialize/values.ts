import type { DateValue, DateValueJSON } from "../types";
import type { TemporalApi } from "../temporal/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toJSON(value: DateValue): DateValueJSON {
  switch (value.kind) {
    case "single":
      return { kind: "single", date: value.date.toString() };
    case "range":
      return { kind: "range", start: value.start.toString(), end: value.end.toString() };
    case "multiple":
      return { kind: "multiple", dates: value.dates.map((date) => date.toString()) };
  }
}

export function fromJSONWithTemporal(value: unknown, Temporal: TemporalApi): DateValue {
  assertDateValueJSON(value, Temporal);

  switch (value.kind) {
    case "single":
      return { kind: "single", date: Temporal.PlainDate.from(value.date) };
    case "range":
      return {
        kind: "range",
        start: Temporal.PlainDate.from(value.start),
        end: Temporal.PlainDate.from(value.end),
      };
    case "multiple":
      return { kind: "multiple", dates: value.dates.map((date) => Temporal.PlainDate.from(date)) };
  }
}

export function toFormValue(value: DateValue): string {
  switch (value.kind) {
    case "single":
      return value.date.toString();
    case "range":
      return `${value.start.toString()}/${value.end.toString()}`;
    case "multiple":
      return value.dates.map((date) => date.toString()).join(",");
  }
}

export function fromFormValueWithTemporal(value: string, Temporal: TemporalApi): DateValue {
  const trimmed = value.trim();

  if (trimmed.includes("/")) {
    const [start, end] = trimmed.split("/");
    if (!start || !end) {
      throw new TypeError("Range form values must use start/end.");
    }
    return fromJSONWithTemporal({ kind: "range", start, end }, Temporal);
  }

  if (trimmed.includes(",")) {
    return fromJSONWithTemporal({ kind: "multiple", dates: trimmed.split(",").map((date) => date.trim()) }, Temporal);
  }

  return fromJSONWithTemporal({ kind: "single", date: trimmed }, Temporal);
}

export function isDateValueJSON(value: unknown, Temporal?: TemporalApi): value is DateValueJSON {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "single") {
    return isIsoPlainDate(value.date, Temporal);
  }

  if (value.kind === "range") {
    return (
      isIsoPlainDate(value.start, Temporal) &&
      isIsoPlainDate(value.end, Temporal) &&
      (!Temporal || Temporal.PlainDate.compare(value.start, value.end) <= 0)
    );
  }

  if (value.kind === "multiple") {
    return Array.isArray(value.dates) && value.dates.every((date) => isIsoPlainDate(date, Temporal));
  }

  return false;
}

export function assertDateValueJSON(value: unknown, Temporal?: TemporalApi): asserts value is DateValueJSON {
  if (!isDateValueJSON(value, Temporal)) {
    throw new TypeError("Expected a valid Calchemy date JSON value.");
  }
}

function isIsoPlainDate(value: unknown, Temporal?: TemporalApi): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  if (!Temporal) {
    return true;
  }

  try {
    Temporal.PlainDate.from(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
