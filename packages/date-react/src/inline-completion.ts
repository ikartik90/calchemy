import type { InlineCompletion } from "@calchemy/date-core";

export function composeInlineCompletion(
  inputValue: string,
  completion: InlineCompletion,
): string {
  return `${inputValue}${completion.suffix}`;
}

export function formatInlineCompletionDescription(
  inputValue: string,
  completion: InlineCompletion,
): string {
  return `Suggestion: ${composeInlineCompletion(inputValue, completion)}. Press Tab to accept.`;
}
