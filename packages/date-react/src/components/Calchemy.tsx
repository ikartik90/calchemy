import { createContext, useContext } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { DateValue } from "@calchemy/date-core";
import { useCalchemy, type CalchemyState, type UseCalchemyOptions } from "../hooks/useCalchemy";

const CalchemyContext = createContext<CalchemyState | null>(null);

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

  const candidates = state.expectedValue
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

export type CalchemyCalendarProps = Omit<ComponentPropsWithoutRef<"div">, "onSelect"> & {
  month?: DateValue;
};

function Calendar(props: CalchemyCalendarProps) {
  const { month: _month, ...divProps } = props;
  const state = useCalchemyContext();

  if (state.expectedValue && state.expectedValue !== "single") {
    return null;
  }

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

export function useCalchemyContext(): CalchemyState {
  const state = useContext(CalchemyContext);

  if (!state) {
    throw new Error("Calchemy components must be rendered inside Calchemy.Root.");
  }

  return state;
}

export const Calchemy = {
  Root,
  Field,
  Candidates,
  Calendar,
};
