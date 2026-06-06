import { createContext, useContext } from "react";
import type { CalchemyState } from "../../hooks/useCalchemy";
import type { CalendarPeriodModel, CalendarScrollContextValue, CalendarState } from "./types";

export const CalchemyContext = createContext<CalchemyState | null>(null);
export const CalendarContext = createContext<CalendarState | null>(null);
export const CalendarPeriodContext = createContext<CalendarPeriodModel | null>(null);
export const CalendarScrollContext = createContext<CalendarScrollContextValue | null>(null);

export function useCalchemyContext(): CalchemyState {
  const state = useContext(CalchemyContext);

  if (!state) {
    throw new Error("Calchemy components must be rendered inside Calchemy.Root.");
  }

  return state;
}

export function useCalchemyCalendar(): CalendarState {
  const state = useContext(CalendarContext);

  if (!state) {
    throw new Error("Calchemy calendar components must be rendered inside Calchemy.Calendar.");
  }

  return state;
}

export function useCalendarPeriod(): CalendarPeriodModel | null {
  return useContext(CalendarPeriodContext);
}
