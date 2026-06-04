import { firstWeekdayAfter, firstWeekdayBefore, firstWeekdayOnOrAfter } from "../primitives/date-math";
import type { RelationDirection, RelationSlice } from "../slice";
import type { PlainDate } from "../../temporal/types";
import type { DateValue } from "../../types";

// Example: `applyRelations(nextWeekendRange, thursdayBeforeRelation)` resolves the Thursday before the range.
export function applyRelations(value: DateValue, relation: RelationSlice | null): DateValue | null {
  if (!relation) {
    return value;
  }

  if (relation.kind === "weekday-in-boundary") {
    if (value.kind !== "range") {
      return null;
    }

    const date =
      relation.placement === "last"
        ? firstWeekdayBefore(value.end.add({ days: 1 }), relation.weekday)
        : firstWeekdayOnOrAfter(value.start, relation.weekday);

    return isInsideRange(date, value) ? { kind: "single", date } : null;
  }

  const anchor = getRelationAnchor(value, relation.direction);
  if (!anchor) {
    return null;
  }

  let date =
    relation.direction === "before" || relation.direction === "preceding"
      ? firstWeekdayBefore(anchor, relation.weekday)
      : firstWeekdayAfter(anchor, relation.weekday);

  for (let index = 1; index < relation.ordinal; index += 1) {
    date =
      relation.direction === "before" || relation.direction === "preceding" ? date.subtract({ days: 7 }) : date.add({ days: 7 });
  }

  return { kind: "single", date };
}

// Example: `getRelationAnchor(range, "before")` returns the range start.
function getRelationAnchor(value: DateValue, direction: RelationDirection): PlainDate | null {
  if (value.kind === "single") {
    return value.date;
  }

  if (value.kind === "range") {
    return direction === "before" || direction === "preceding" ? value.start : value.end;
  }

  return null;
}

// Example: `isInsideRange(date, monthRange)` checks inclusive range containment.
function isInsideRange(date: PlainDate, range: Extract<DateValue, { kind: "range" }>): boolean {
  return date.toString().localeCompare(range.start.toString()) >= 0 && date.toString().localeCompare(range.end.toString()) <= 0;
}
