import { toDuration } from "../primitives/shared";
import type { TransformSlice } from "../slice";
import type { PlainDate } from "../../temporal/types";
import type { DateValue } from "../../types";

// Example: `applyTransforms(singleDate, [{ operator: "plus", amount: 2, unit: "week" }])` shifts the date.
export function applyTransforms(value: DateValue, transforms: readonly TransformSlice[]): DateValue {
  return transforms.reduce((current, transform) => applyTransform(current, transform), value);
}

// Example: `applyTransform(range, plusOneWeek)` shifts both range endpoints.
function applyTransform(value: DateValue, transform: TransformSlice): DateValue {
  if (value.kind === "single") {
    return { kind: "single", date: shiftDate(value.date, transform) };
  }

  if (value.kind === "range") {
    return { kind: "range", start: shiftDate(value.start, transform), end: shiftDate(value.end, transform) };
  }

  return { kind: "multiple", dates: value.dates.map((date) => shiftDate(date, transform)) };
}

// Example: `shiftDate(date, { operator: "minus", amount: 3, unit: "day" })` subtracts three days.
function shiftDate(date: PlainDate, transform: TransformSlice): PlainDate {
  const duration = toDuration(transform.amount, transform.unit);
  return transform.operator === "minus" ? date.subtract(duration) : date.add(duration);
}
