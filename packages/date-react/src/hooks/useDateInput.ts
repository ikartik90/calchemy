import { useMemo, useState } from "react";
import type { Calchemy, DateValue, ParseDateContext, ParseDateResult } from "@calchemy/date-core";

export type UseDateInputOptions = {
  calchemy: Calchemy;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  onValueChange?: (value: DateValue | null, result: ParseDateResult) => void;
  parseContext?: ParseDateContext;
  inputValue?: string;
  defaultInputValue?: string;
  onInputValueChange?: (value: string) => void;
};

export type DateInputState = {
  inputValue: string;
  value: DateValue | null;
  result: ParseDateResult;
  inlineCompletion: ReturnType<Calchemy["getInlineCompletion"]>;
  setInputValue(value: string): void;
  acceptCompletion(): void;
  selectCandidate(candidateId: string): void;
  selectDate(value: DateValue): void;
  getInputProps(): {
    value: string;
    onChange(event: { currentTarget: { value: string } }): void;
    onKeyDown(event: { key: string; preventDefault(): void }): void;
    "aria-invalid": boolean;
    "data-status": ParseDateResult["status"];
  };
};

export function useDateInput(options: UseDateInputOptions): DateInputState {
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState(options.defaultInputValue ?? "");
  const [uncontrolledValue, setUncontrolledValue] = useState<DateValue | null>(options.defaultValue ?? null);
  const inputValue = options.inputValue ?? uncontrolledInputValue;
  const value = options.value ?? uncontrolledValue;
  const result = useMemo(
    () => options.calchemy.parseDate(inputValue, options.parseContext),
    [inputValue, options.calchemy, options.parseContext],
  );
  const inlineCompletion = useMemo(
    () => options.calchemy.getInlineCompletion(inputValue),
    [inputValue, options.calchemy],
  );

  function updateInputValue(nextValue: string) {
    if (options.inputValue === undefined) {
      setUncontrolledInputValue(nextValue);
    }
    options.onInputValueChange?.(nextValue);

    const nextResult = options.calchemy.parseDate(nextValue, options.parseContext);
    if (nextResult.status === "valid") {
      updateValue(nextResult.value, nextResult);
    }
  }

  function updateValue(nextValue: DateValue | null, nextResult: ParseDateResult = result) {
    if (options.value === undefined) {
      setUncontrolledValue(nextValue);
    }
    options.onValueChange?.(nextValue, nextResult);
  }

  function acceptCompletion() {
    if (!inlineCompletion) {
      return;
    }

    updateInputValue(inlineCompletion.value);
  }

  function selectCandidate(candidateId: string) {
    if (result.status !== "ambiguous") {
      return;
    }

    const candidate = result.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      return;
    }

    updateValue(candidate.value, {
      status: "valid",
      input: inputValue,
      value: candidate.value,
      candidates: [candidate],
      corrections: result.corrections,
    });
  }

  function selectDate(nextValue: DateValue) {
    updateValue(nextValue);
    if (nextValue.kind === "single") {
      updateInputValue(nextValue.date.toString());
    }
  }

  return {
    inputValue,
    value,
    result,
    inlineCompletion,
    setInputValue: updateInputValue,
    acceptCompletion,
    selectCandidate,
    selectDate,
    getInputProps() {
      return {
        value: inputValue,
        onChange(event) {
          updateInputValue(event.currentTarget.value);
        },
        onKeyDown(event) {
          if (event.key === "Tab" && inlineCompletion) {
            event.preventDefault();
            acceptCompletion();
          }
        },
        "aria-invalid": result.status === "invalid",
        "data-status": result.status,
      };
    },
  };
}
