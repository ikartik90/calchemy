import { useEffect, useMemo, useState } from "react";
import { resolveExpectedDateValue } from "@calchemy/date-core";
import {
  composeInlineCompletion,
  formatInlineCompletionDescription,
} from "../inline-completion";
import { useDebouncedValue } from "./useDebouncedValue";
import type {
  Calchemy,
  DateValue,
  ExpectedDateValue,
  ParseDateContext,
  ParseDateResult,
  ResolveExpectedDateValueOptions,
} from "@calchemy/date-core";

export type CalchemyInputMode = "field" | "calendar";

export type UseCalchemyOptions = ResolveExpectedDateValueOptions & {
  calchemy: Calchemy;
  expectedValue: ExpectedDateValue;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  onValueChange?: (value: DateValue | null, result: ParseDateResult) => void;
  parseContext?: ParseDateContext;
  inputValue?: string;
  defaultInputValue?: string;
  onInputValueChange?: (value: string) => void;
  inputMode?: CalchemyInputMode;
  defaultInputMode?: CalchemyInputMode;
  onInputModeChange?: (mode: CalchemyInputMode) => void;
};

export type CalchemyState = {
  calchemy: Calchemy;
  parseContext: ParseDateContext | undefined;
  inputValue: string;
  value: DateValue | null;
  result: ParseDateResult;
  expectedValue: ExpectedDateValue;
  inputMode: CalchemyInputMode;
  valueKindMismatch: boolean;
  inlineCompletion: ReturnType<Calchemy["getInlineCompletion"]>;
  setInputValue(value: string): void;
  setInputMode(mode: CalchemyInputMode): void;
  acceptCompletion(): void;
  selectCandidate(candidateId: string): void;
  selectDate(value: DateValue): void;
  getInputProps(): {
    value: string;
    readOnly: boolean;
    onChange(event: { currentTarget: { value: string } }): void;
    onKeyDown(event: { key: string; preventDefault(): void }): void;
    "aria-invalid": boolean;
    "aria-description"?: string;
    "calchemy-status": ParseDateResult["status"] | "kind-mismatch";
    "calchemy-expected-value": ExpectedDateValue | undefined;
    "calchemy-value-kind": ExpectedDateValue | undefined;
  };
};

export function useCalchemy(options: UseCalchemyOptions): CalchemyState {
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState(options.defaultInputValue ?? "");
  const [uncontrolledValue, setUncontrolledValue] = useState<DateValue | null>(options.defaultValue ?? null);
  const [uncontrolledInputMode, setUncontrolledInputMode] = useState<CalchemyInputMode>(
    options.defaultInputMode ?? "field",
  );
  const inputValue = options.inputValue ?? uncontrolledInputValue;
  const value = options.value ?? uncontrolledValue;
  const inputMode = options.inputMode ?? uncontrolledInputMode;
  const fieldInputActive = inputMode === "field";
  const queryValue = useDebouncedValue(inputValue);
  const queryPending = inputValue !== queryValue;
  const result = useMemo(
    () => options.calchemy.parseDate(queryValue, options.parseContext),
    [queryValue, options.calchemy, options.parseContext],
  );
  const expectedValue = options.expectedValue;
  const expectedOptions = {
    ...(options.multipleRangeExpansionLimit === undefined
      ? {}
      : { multipleRangeExpansionLimit: options.multipleRangeExpansionLimit }),
  } satisfies ResolveExpectedDateValueOptions;
  const expectedResult = resolveExpectedDateValue(result, expectedValue, expectedOptions);
  const valueKindMismatch = expectedResult.status === "invalid" && result.status === "valid";
  const settledInlineCompletion = useMemo(
    () => options.calchemy.getInlineCompletion(queryValue, options.parseContext),
    [queryValue, options.calchemy, options.parseContext],
  );
  const inlineCompletion = queryPending ? null : settledInlineCompletion;

  function updateValue(nextValue: DateValue | null, nextResult: ParseDateResult = result) {
    if (options.value === undefined) {
      setUncontrolledValue(nextValue);
    }
    options.onValueChange?.(nextValue, nextResult);
  }

  useEffect(() => {
    const nextResult = options.calchemy.parseDate(queryValue, options.parseContext);
    const nextExpectedResult = resolveExpectedDateValue(
      nextResult,
      expectedValue,
      expectedOptions,
    );
    if (nextExpectedResult.status === "valid") {
      if (options.value === undefined) {
        setUncontrolledValue(nextExpectedResult.value);
      }
      options.onValueChange?.(nextExpectedResult.value, nextExpectedResult);
    }
  }, [
    queryValue,
    expectedValue,
    expectedOptions.multipleRangeExpansionLimit,
    options.calchemy,
    options.parseContext,
  ]);

  function updateInputValue(nextValue: string) {
    if (options.inputValue === undefined) {
      setUncontrolledInputValue(nextValue);
    }
    options.onInputValueChange?.(nextValue);
  }

  function getActiveInlineCompletion() {
    if (!fieldInputActive || queryPending) {
      return null;
    }

    return settledInlineCompletion;
  }

  function setInputMode(nextMode: CalchemyInputMode) {
    if (options.inputMode === undefined) {
      setUncontrolledInputMode(nextMode);
    }
    options.onInputModeChange?.(nextMode);
  }

  function acceptCompletion() {
    const activeCompletion = getActiveInlineCompletion();
    if (!activeCompletion) {
      return;
    }

    updateInputValue(composeInlineCompletion(inputValue, activeCompletion));
  }

  function selectCandidate(candidateId: string) {
    if (!fieldInputActive || result.status !== "ambiguous") {
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
      warnings: result.warnings,
    } satisfies ParseDateResult;
    const resolvedCandidateResult = resolveExpectedDateValue(candidateResult, expectedValue, expectedOptions);
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
      warnings: [],
    } satisfies ParseDateResult;
    const resolvedResult = resolveExpectedDateValue(nextResult, expectedValue, expectedOptions);
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
    result: expectedResult,
    expectedValue,
    inputMode,
    valueKindMismatch,
    inlineCompletion,
    setInputValue: updateInputValue,
    setInputMode,
    acceptCompletion,
    selectCandidate,
    selectDate,
    getInputProps() {
      const activeCompletion = getActiveInlineCompletion();

      return {
        value: inputValue,
        readOnly: !fieldInputActive,
        onChange(event) {
          if (!fieldInputActive) {
            return;
          }

          updateInputValue(event.currentTarget.value);
        },
        onKeyDown(event) {
          if (!fieldInputActive) {
            return;
          }

          if (event.key === "Tab" && activeCompletion) {
            event.preventDefault();
            acceptCompletion();
          }
        },
        "aria-invalid": expectedResult.status === "invalid",
        ...(fieldInputActive && inlineCompletion
          ? {
              "aria-description": formatInlineCompletionDescription(
                inputValue,
                inlineCompletion,
              ),
            }
          : {}),
        "calchemy-status": valueKindMismatch ? "kind-mismatch" : expectedResult.status,
        "calchemy-expected-value": expectedValue,
        "calchemy-value-kind": expectedResult.status === "valid" ? expectedResult.value.kind : undefined,
      };
    },
  };
}
