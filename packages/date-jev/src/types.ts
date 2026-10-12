import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type { DateValue, ParseDateContext } from "./core/types";

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
  | { status: "invalid"; input: string; model: string };

export type JevParser = {
  parseDate(input: string, context?: ParseDateContext): Promise<ParseDateResult>;
};
