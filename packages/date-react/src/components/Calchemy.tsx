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
import { CalendarPeriod } from "./calendar/CalendarPeriod";
import { CalendarPeriodList } from "./calendar/CalendarPeriodList";
import {
  CalendarMonthSelect,
  CalendarYearSelect,
} from "./calendar/CalendarSelects";

export type CalchemyRootProps = UseCalchemyOptions & {
  children: ReactNode;
};

function Root(props: CalchemyRootProps) {
  const { children, ...options } = props;
  const state = useCalchemy(options);

  return (
    <CalchemyContext.Provider value={state}>
      {children}
    </CalchemyContext.Provider>
  );
}

export type CalchemyFieldProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "value" | "onChange" | "onKeyDown"
> & {
  renderInlineCompletion?: boolean;
};

function Field({
  renderInlineCompletion = true,
  readOnly,
  ...props
}: CalchemyFieldProps) {
  const state = useCalchemyContext();
  const inputProps = state.getInputProps();
  const completion =
    state.inputMode === "field" ? state.inlineCompletion : null;

  return (
    <span
      calchemy-field=""
      calchemy-input-mode={state.inputMode}
      calchemy-has-completion={completion ? "" : undefined}
    >
      {renderInlineCompletion && completion ? (
        <span calchemy-field-backdrop="" aria-hidden="true">
          <span calchemy-field-typed="">{state.inputValue}</span>
          <span calchemy-completions="">{completion.suffix}</span>
        </span>
      ) : null}
      <input {...props} {...inputProps} readOnly={readOnly ?? inputProps.readOnly} />
    </span>
  );
}

export type CalchemyInputModeProps = ComponentPropsWithoutRef<"div"> & {
  fieldLabel?: ReactNode;
  calendarLabel?: ReactNode;
};

function InputMode({
  fieldLabel = "Type",
  calendarLabel = "Pick",
  ...props
}: CalchemyInputModeProps) {
  const state = useCalchemyContext();

  return (
    <div {...props} calchemy-mode="" calchemy-active={state.inputMode} role="group">
      <button
        type="button"
        calchemy-value="field"
        aria-pressed={state.inputMode === "field"}
        onClick={() => state.setInputMode("field")}
      >
        {fieldLabel}
      </button>
      <button
        type="button"
        calchemy-value="calendar"
        aria-pressed={state.inputMode === "calendar"}
        onClick={() => state.setInputMode("calendar")}
      >
        {calendarLabel}
      </button>
    </div>
  );
}

export type CalchemyCandidatesProps = ComponentPropsWithoutRef<"div">;

function Candidates(props: CalchemyCandidatesProps) {
  const state = useCalchemyContext();

  if (state.inputMode !== "field" || state.result.status !== "ambiguous") {
    return null;
  }

  const candidates =
    state.expectedValue && state.expectedValue !== "multiple"
      ? state.result.candidates.filter(
          (candidate) => candidate.value.kind === state.expectedValue,
        )
      : state.result.candidates;

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div {...props} calchemy-candidates="">
      {candidates.map((candidate) => (
        <button
          type="button"
          key={candidate.id}
          calchemy-candidate=""
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
  CalendarWeekdayFormat,
  ParsedCalendarPeriod,
} from "./calendar/types";
export type {
  CalchemyCalendarHeaderProps,
  CalchemyCalendarHeadingProps,
  CalchemyCalendarNavigationProps,
  CalchemyCalendarProps,
} from "./calendar/Calendar";
export type {
  CalchemyCalendarGridProps,
  CalchemyCalendarWeekdaysProps,
} from "./calendar/CalendarGrid";
export type { CalchemyCalendarPeriodHeadingProps } from "./calendar/CalendarPeriodHeading";
export type { CalchemyCalendarPeriodListProps } from "./calendar/CalendarPeriodList";
export type { CalchemyCalendarPeriodProps } from "./calendar/CalendarPeriod";
export type {
  CalchemyCalendarMonthSelectProps,
  CalchemyCalendarYearSelectProps,
} from "./calendar/CalendarSelects";

export const Calchemy = {
  Root,
  Field,
  InputMode,
  Candidates,
  Calendar,
  CalendarHeader,
  CalendarHeading,
  CalendarPrevious,
  CalendarNext,
  CalendarPeriodList,
  CalendarPeriod,
  CalendarPeriodHeading,
  CalendarWeekdays,
  CalendarGrid,
  CalendarMonthSelect,
  CalendarYearSelect,
};
