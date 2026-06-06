import { useMemo, useState } from "react";
import { resolveExpectedDateValue } from "@calchemy/date-core";
import type { Calchemy, DateValue, ExpectedDateValue, ParseDateContext, ParseDateResult } from "@calchemy/date-core";

export type UseCalchemyOptions = {
  calchemy: Calchemy;
  expectedValue?: ExpectedDateValue;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  onValueChange?: (value: DateValue | null, result: ParseDateResult) => void;
  parseContext?: ParseDateContext;
  inputValue?: string;
  defaultInputValue?: string;
  onInputValueChange?: (value: string) => void;
};

export type CalchemyState = {
  calchemy: Calchemy;
  parseContext: ParseDateContext | undefined;
  inputValue: string;
  value: DateValue | null;
  result: ParseDateResult;
  expectedValue: ExpectedDateValue | null;
  valueKindMismatch: boolean;
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
    "data-status": ParseDateResult["status"] | "kind-mismatch";
    "data-expected-value": ExpectedDateValue | undefined;
    "data-value-kind": ExpectedDateValue | undefined;
  };
};

export function useCalchemy(options: UseCalchemyOptions): CalchemyState {
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState(options.defaultInputValue ?? "");
  const [uncontrolledValue, setUncontrolledValue] = useState<DateValue | null>(options.defaultValue ?? null);
  const inputValue = options.inputValue ?? uncontrolledInputValue;
  const value = options.value ?? uncontrolledValue;
  const result = useMemo(
    () => options.calchemy.parseDate(inputValue, options.parseContext),
    [inputValue, options.calchemy, options.parseContext],
  );
  const expectedValue = options.expectedValue ?? null;
  const expectedResult = expectedValue ? resolveExpectedDateValue(result, expectedValue) : result;
  const valueKindMismatch = expectedResult.status === "invalid" && result.status === "valid";
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
    const nextExpectedResult = expectedValue ? resolveExpectedDateValue(nextResult, expectedValue) : nextResult;
    if (nextExpectedResult.status === "valid") {
      updateValue(nextExpectedResult.value, nextExpectedResult);
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

    const candidateResult = {
      status: "valid",
      input: inputValue,
      value: candidate.value,
      candidates: [candidate],
      corrections: result.corrections,
    } satisfies ParseDateResult;
    const resolvedCandidateResult = expectedValue ? resolveExpectedDateValue(candidateResult, expectedValue) : candidateResult;
    if (resolvedCandidateResult.status !== "valid") {
      return;
    }

    updateValue(resolvedCandidateResult.value, resolvedCandidateResult);
  }

  function selectDate(nextValue: DateValue) {
    const nextResult = {
      status: "valid",
      input: inputValue,
      value: nextValue,
      candidates: [],
      corrections: [],
    } satisfies ParseDateResult;
    const resolvedResult = expectedValue ? resolveExpectedDateValue(nextResult, expectedValue) : nextResult;
    if (resolvedResult.status !== "valid") {
      return;
    }

    updateValue(resolvedResult.value, resolvedResult);
    if (resolvedResult.value.kind === "single") {
      updateInputValue(resolvedResult.value.date.toString());
    }
  }

  return {
    calchemy: options.calchemy,
    parseContext: options.parseContext,
    inputValue,
    value,
    result,
    expectedValue,
    valueKindMismatch,
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
        "aria-invalid": expectedResult.status === "invalid",
        "data-status": valueKindMismatch ? "kind-mismatch" : result.status,
        "data-expected-value": expectedValue ?? undefined,
        "data-value-kind": result.status === "valid" ? result.value.kind : undefined,
      };
    },
  };
}

