import assert from "node:assert/strict";
import test from "node:test";
import { generatePlan } from "../src/lib/generator";
import {
  countCompletableWorkouts,
  isCompletableWorkout,
  isFutureCompletion,
  parseWorkoutCompletionUpdate,
} from "../src/lib/workout-completion";

const plan = generatePlan({
  athleteName: "Testløper",
  targetRace: "10000",
  vdot: 42,
  goalTimeSec: null,
  experienceLevel: "mosjonist",
  weeks: 8,
  daysPerWeek: 4,
  weeklyKm: 35,
  hrMax: 190,
  startDate: "2026-08-03",
});

test("fullført-status krever gyldig dato og boolsk verdi", () => {
  assert.deepEqual(
    parseWorkoutCompletionUpdate({
      date: "2026-08-04",
      completed: true,
    }),
    { date: "2026-08-04", completed: true }
  );
  assert.throws(
    () =>
      parseWorkoutCompletionUpdate({
        date: "04.08.2026",
        completed: true,
      }),
    /gyldig øktdato/
  );
  assert.throws(
    () =>
      parseWorkoutCompletionUpdate({
        date: "2026-08-04",
        completed: "ja",
      }),
    /sann eller usann/
  );
});

test("bare faktiske løpeøkter kan markeres som gjennomført", () => {
  const runningDay = plan.weeks
    .flatMap((week) => week.days)
    .find((day) => day.type !== "hvile" && day.km > 0)!;
  const restDay = plan.weeks
    .flatMap((week) => week.days)
    .find((day) => day.type === "hvile")!;

  assert.equal(isCompletableWorkout(plan, runningDay.date), true);
  assert.equal(isCompletableWorkout(plan, restDay.date), false);
  assert.equal(isCompletableWorkout(plan, "2099-12-31"), false);
});

test("økter kan ikke krysses av frem i tid, men kan alltid fjernes", () => {
  const today = "2026-08-10";
  assert.equal(isFutureCompletion({ date: "2026-08-11", completed: true }, today), true);
  assert.equal(isFutureCompletion({ date: "2026-08-10", completed: true }, today), false);
  assert.equal(isFutureCompletion({ date: "2026-08-01", completed: true }, today), false);
  assert.equal(isFutureCompletion({ date: "2026-08-11", completed: false }, today), false);
});

test("antall gjennomførbare økter teller alt som ikke er hvile", () => {
  const manual = plan.weeks
    .flatMap((week) => week.days)
    .filter((day) => day.type !== "hvile" && day.km > 0).length;
  assert.equal(countCompletableWorkouts(plan), manual);
  assert.ok(manual > 0);
});
