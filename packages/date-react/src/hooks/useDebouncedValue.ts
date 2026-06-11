import { useEffect, useState } from "react";

export const PARSE_QUERY_DEBOUNCE_MS = 150;

export function useDebouncedValue<T>(value: T, delayMs = PARSE_QUERY_DEBOUNCE_MS): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
