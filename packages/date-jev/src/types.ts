import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type { DateValue, ParseDateContext, ParseDateError } from "./core/types";

export type CreateJevParserOptions = {
  /** A client the app builds with its own TypeSafe key. date-jev never reads or stores the key. */
  client: Pick<TypeSafeClient, "systemOne">;
};

export type ParseDateResult =
  | {
      status: "valid";
      input: string;
      value: DateValue;
      /** The weakest confidence among the Jev answers this reading used, from 0 to 1. */
      confidence: number;
      model: string;
    }
  | {
      status: "ambiguous";
      input: string;
      /** The competing readings, in date-core's order, such as June 27 before June 2027 for `june 27`. */
      candidates: Candidate[];
      /** The sum of the candidates' confidences. */
      confidence: number;
      model: string;
    }
  | {
      status: "invalid";
      input: string;
      errors: ParseDateError[];
      /** Absent when date-jev answered without asking Jev, as for empty input. */
      model?: string;
    };

/** One reading of an ambiguous phrase. `id` matches date-core's candidate ids, such as `month-day`. */
export type Candidate = {
  id: string;
  value: DateValue;
  /** This reading's share of the result's confidence, from Jev's leaning between the readings. */
  confidence: number;
  label: string;
};

export type JevParser = {
  parseDate(input: string, context?: ParseDateContext): Promise<ParseDateResult>;
};
