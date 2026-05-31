import type { Temporal } from "@js-temporal/polyfill";

export type TemporalApi = typeof Temporal;
export type PlainDate = Temporal.PlainDate;
export type ZonedDateTime = Temporal.ZonedDateTime;

export type TemporalGlobal = typeof globalThis & {
  Temporal?: TemporalApi;
};
