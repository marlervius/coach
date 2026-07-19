import { isValidIsoDate } from "./date";
import type { Plan } from "./types";

export interface WorkoutCompletionUpdate {
  date: string;
  completed: boolean;
}

export class WorkoutCompletionValidationError extends Error {}

export function parseWorkoutCompletionUpdate(
  value: unknown
): WorkoutCompletionUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkoutCompletionValidationError("Ugyldig forespørsel");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.date !== "string" || !isValidIsoDate(body.date)) {
    throw new WorkoutCompletionValidationError("Velg en gyldig øktdato");
  }
  if (typeof body.completed !== "boolean") {
    throw new WorkoutCompletionValidationError(
      "Fullført-status må være sann eller usann"
    );
  }

  return { date: body.date, completed: body.completed };
}

export function isCompletableWorkout(plan: Plan, date: string): boolean {
  return plan.weeks.some((week) =>
    week.days.some(
      (day) => day.date === date && day.type !== "hvile" && day.km > 0
    )
  );
}
