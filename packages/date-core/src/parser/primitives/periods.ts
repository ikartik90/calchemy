export type Period = "day" | "week" | "weekdays" | "weekend" | "month" | "quarter" | "year";

export function parsePeriod(input: string): Period | null {
  if (input === "weekday" || input === "weekdays") {
    return "weekdays";
  }

  if (input === "weekend" || input === "weekends") {
    return "weekend";
  }

  if (input === "day" || input === "week" || input === "month" || input === "quarter" || input === "year") {
    return input;
  }

  return null;
}
