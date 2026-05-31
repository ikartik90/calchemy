import { createContext, useContext } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Calchemy, DateValue } from "@calchemy/date-core";
import { useDateInput, type DateInputState, type UseDateInputOptions } from "../hooks/useDateInput";

const DateInputContext = createContext<DateInputState | null>(null);

export type DateInputRootProps = UseDateInputOptions & {
  children: ReactNode;
};

function Root(props: DateInputRootProps) {
  const { children, ...options } = props;
  const state = useDateInput(options);

  return <DateInputContext.Provider value={state}>{children}</DateInputContext.Provider>;
}

export type DateInputFieldProps = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "onKeyDown"> & {
  renderInlineCompletion?: boolean;
};

function Field({ renderInlineCompletion = true, ...props }: DateInputFieldProps) {
  const state = useDateInputContext();
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

export type DateInputCandidatesProps = ComponentPropsWithoutRef<"div">;

function Candidates(props: DateInputCandidatesProps) {
  const state = useDateInputContext();

  if (state.result.status !== "ambiguous") {
    return null;
  }

  return (
    <div {...props} data-calchemy-candidates="">
      {state.result.candidates.map((candidate) => (
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

export type DateInputCalendarProps = Omit<ComponentPropsWithoutRef<"div">, "onSelect"> & {
  month?: DateValue;
};

function Calendar(props: DateInputCalendarProps) {
  const { month: _month, ...divProps } = props;
  const state = useDateInputContext();
  const selected = state.value?.kind === "single" ? state.value.date : null;
  const baseDate =
    selected ??
    (state.result.status === "valid" && state.result.value.kind === "single" ? state.result.value.date : null);

  if (!baseDate) {
    return null;
  }

  const first = baseDate.with({ day: 1 });
  const days = Array.from({ length: first.daysInMonth }, (_, index) => first.add({ days: index }));

  return (
    <div {...divProps} data-calchemy-calendar="">
      {days.map((date) => (
        <button
          type="button"
          key={date.toString()}
          data-calchemy-calendar-day=""
          data-selected={selected?.equals(date) ? "" : undefined}
          onClick={() => state.selectDate({ kind: "single", date })}
        >
          {date.day}
        </button>
      ))}
    </div>
  );
}

export function useDateInputContext(): DateInputState {
  const state = useContext(DateInputContext);

  if (!state) {
    throw new Error("DateInput components must be rendered inside DateInput.Root.");
  }

  return state;
}

export const DateInput = {
  Root,
  Field,
  Candidates,
  Calendar,
};

export type { Calchemy };
