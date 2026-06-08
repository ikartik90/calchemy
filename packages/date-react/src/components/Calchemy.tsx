import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CalchemyContext, useCalchemyContext } from "./calendar/context";
import { useCalchemy, type UseCalchemyOptions } from "../hooks/useCalchemy";
import {
  Calendar,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
} from "./calendar/Calendar";
import { CalendarGrid, CalendarWeekdays } from "./calendar/CalendarGrid";
import { CalendarPeriodHeading } from "./calendar/CalendarPeriodHeading";
import { CalendarPeriod, CalendarPeriodList, CalendarScroll } from "./calendar/CalendarScroll";
import { CalendarMonthSelect, CalendarYearSelect } from "./calendar/CalendarSelects";

export type CalchemyRootProps = UseCalchemyOptions & {
  children: ReactNode;
};

function Root(props: CalchemyRootProps) {
  const { children, ...options } = props;
  const state = useCalchemy(options);

  return <CalchemyContext.Provider value={state}>{children}</CalchemyContext.Provider>;
}

export type CalchemyFieldProps = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "onKeyDown"> & {
  renderInlineCompletion?: boolean;
};

function Field({ renderInlineCompletion = true, ...props }: CalchemyFieldProps) {
  const state = useCalchemyContext();
  const inputProps = state.getInputProps();

  return (
    <span data-calchemy-field="">
      <input {...props} {...inputProps} />
      {renderInlineCompletion && state.inlineCompletion ? (
        <span aria-hidden="true" data-calchemy-inline-completion="">
          {state.inlineCompletion.suffix}
        </span>
      ) : null}
    </span>
  );
}

export type CalchemyCandidatesProps = ComponentPropsWithoutRef<"div">;

function Candidates(props: CalchemyCandidatesProps) {
  const state = useCalchemyContext();

  if (state.result.status !== "ambiguous") {
    return null;
  }

  const candidates = state.expectedValue && state.expectedValue !== "multiple"
    ? state.result.candidates.filter((candidate) => candidate.value.kind === state.expectedValue)
    : state.result.candidates;

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div {...props} data-calchemy-candidates="">
      {candidates.map((candidate) => (
        <button
          type="button"
          key={candidate.id}
          data-calchemy-candidate=""
          onClick={() => state.selectCandidate(candidate.id)}
        >
          {candidate.label}
        </button>
      ))}
    </div>
  );
}

export { useCalchemyCalendar, useCalchemyContext } from "./calendar/context";

export type {
  CalendarBounds,
  CalendarDuration,
  CalendarNamedDates,
  CalendarPeriodModel,
  CalendarPeriodUnit,
  CalendarState,
  ParsedCalendarPeriod,
} from "./calendar/types";
export type {
  CalchemyCalendarHeaderProps,
  CalchemyCalendarHeadingProps,
  CalchemyCalendarNavigationProps,
  CalchemyCalendarProps,
} from "./calendar/Calendar";
export type { CalchemyCalendarGridProps, CalchemyCalendarWeekdaysProps } from "./calendar/CalendarGrid";
export type { CalchemyCalendarPeriodHeadingProps } from "./calendar/CalendarPeriodHeading";
export type {
  CalchemyCalendarPeriodListProps,
  CalchemyCalendarPeriodProps,
  CalchemyCalendarScrollProps,
} from "./calendar/CalendarScroll";
export type { CalchemyCalendarMonthSelectProps, CalchemyCalendarYearSelectProps } from "./calendar/CalendarSelects";

export const Calchemy = {
  Root,
  Field,
  Candidates,
  Calendar,
  CalendarHeader,
  CalendarHeading,
  CalendarPrevious,
  CalendarNext,
  CalendarScroll,
  CalendarPeriodList,
  CalendarPeriod,
  CalendarPeriodHeading,
  CalendarWeekdays,
  CalendarGrid,
  CalendarMonthSelect,
  CalendarYearSelect,
};
