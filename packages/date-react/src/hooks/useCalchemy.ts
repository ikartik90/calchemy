import { useMemo, useState } from "react";
import { resolveExpectedDateValue } from "@calchemy/date-core";
import type {
  Calchemy,
  DateValue,
  ExpectedDateValue,
  ParseDateContext,
  ParseDateResult,
  ResolveExpectedDateValueOptions,
} from "@calchemy/date-core";

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
};

export type CalchemyState = {
  calchemy: Calchemy;
  parseContext: ParseDateContext | undefined;
  inputValue: string;
  value: DateValue | null;
  result: ParseDateResult;
  expectedValue: ExpectedDateValue;
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
  const expectedValue = options.expectedValue;
  const expectedOptions = {
    ...(options.multipleRangeExpansionLimit === undefined
      ? {}
      : { multipleRangeExpansionLimit: options.multipleRangeExpansionLimit }),
  } satisfies ResolveExpectedDateValueOptions;
  const expectedResult = resolveExpectedDateValue(result, expectedValue, expectedOptions);
  const valueKindMismatch = expectedResult.status === "invalid" && result.status === "valid";
  const inlineCompletion = useMemo(
    () => options.calchemy.getInlineCompletion(inputValue, options.parseContext),
    [inputValue, options.calchemy, options.parseContext],
  );

  function updateInputValue(nextValue: string) {
    if (options.inputValue === undefined) {
      setUncontrolledInputValue(nextValue);
    }
    options.onInputValueChange?.(nextValue);

    const nextResult = options.calchemy.parseDate(nextValue, options.parseContext);
    const nextExpectedResult = resolveExpectedDateValue(nextResult, expectedValue, expectedOptions);
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
        "data-status": valueKindMismatch ? "kind-mismatch" : expectedResult.status,
        "data-expected-value": expectedValue,
        "data-value-kind": expectedResult.status === "valid" ? expectedResult.value.kind : undefined,
      };
    },
  };
}

