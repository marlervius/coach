import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, peakWeeklyKm } from "../src/lib/generator";
import { addIsoDays } from "../src/lib/date";
import type { ProgramInput } from "../src/lib/types";

const baseInput: ProgramInput = {
  athleteName: "Testløper",
  targetRace: "5000",
  vdot: 50,
  weeks: 12,
  daysPerWeek: 3,
  weeklyKm: 10,
  startDate: "2026-07-20",
};

test("lavt ukesvolum overskrides ikke av faste kvalitetsøkter", () => {
  const plan = generatePlan(baseInput);
  const peakKm = peakWeeklyKm(baseInput.weeks, baseInput.weeklyKm, baseInput.targetRace);

  for (const week of plan.weeks.slice(0, -1)) {
    assert.ok(
      week.km <= peakKm,
      `uke ${week.nr} fikk ${week.km} km, men toppvolumet er ${peakKm} km`
    );
  }
});

test("ukesummen samsvarer med summen av dagene", () => {
  const plan = generatePlan(baseInput);
  for (const week of plan.weeks) {
    const sum = Math.round(week.days.reduce((total, day) => total + day.km, 0) * 2) / 2;
    assert.equal(week.km, sum, `feil ukesum i uke ${week.nr}`);
  }
});

test("datoene er sammenhengende og første dag er startdatoen", () => {
  const plan = generatePlan(baseInput);
  const days = plan.weeks.flatMap((week) => week.days);
  assert.equal(days.length, baseInput.weeks * 7);
  days.forEach((day, index) => {
    assert.equal(day.date, addIsoDays(baseInput.startDate, index));
    assert.equal(day.dow, index % 7);
  });
});

test("volumtaket holder på tvers av distanser, programlengder og øktfrekvens", () => {
  const distances = ["3000", "5000", "10000", "halvmaraton", "maraton"];
  for (const targetRace of distances) {
    for (const weeks of [2, 3, 5, 12, 30]) {
      for (const daysPerWeek of [3, 4, 5, 6, 7]) {
        const weeklyKm = Math.max(10, daysPerWeek * 3);
        const plan = generatePlan({
          ...baseInput,
          targetRace,
          weeks,
          daysPerWeek,
          weeklyKm,
        });
        const peakKm = peakWeeklyKm(weeks, weeklyKm, targetRace);
        for (const week of plan.weeks.slice(0, -1)) {
          assert.ok(
            week.km <= peakKm,
            `${targetRace}, ${weeks} uker, ${daysPerWeek} økter: uke ${week.nr} fikk ${week.km} > ${peakKm}`
          );
        }
      }
    }
  }
});

test("langturen er alltid lengre enn ukas rolige turer", () => {
  const distances = ["3000", "5000", "10000", "halvmaraton", "maraton"];
  for (const targetRace of distances) {
    for (const weeks of [2, 3, 5, 12, 30]) {
      for (const daysPerWeek of [3, 4, 5, 6, 7]) {
        const weeklyKm = Math.max(10, daysPerWeek * 3);
        const plan = generatePlan({ ...baseInput, targetRace, weeks, daysPerWeek, weeklyKm });
        for (const week of plan.weeks) {
          const long = week.days.find((d) => d.type === "langtur");
          if (!long) continue; // konkurranseuka har ingen langtur
          for (const day of week.days) {
            if (day.type !== "rolig") continue;
            assert.ok(
              day.km < long.km,
              `${targetRace}, ${weeks} uker, ${daysPerWeek} økter, uke ${week.nr}: rolig ${day.km} km ≥ langtur ${long.km} km`
            );
          }
        }
      }
    }
  }
});

test("langturen vokser med ukesvolumet gjennom oppbyggingen", () => {
  const plan = generatePlan({ ...baseInput, weeks: 12, daysPerWeek: 5, weeklyKm: 40 });
  const buildWeeks = plan.weeks.filter(
    (week) => (week.phase === 1 || week.phase === 2) && !week.phaseName.includes("restitusjonsuke")
  );
  const longRuns = buildWeeks.map(
    (week) => week.days.find((d) => d.type === "langtur")?.km ?? 0
  );
  assert.ok(longRuns.length >= 3, "forventet flere oppbyggingsuker");
  for (let i = 1; i < longRuns.length; i++) {
    assert.ok(
      longRuns[i] >= longRuns[i - 1],
      `langturen krympet fra ${longRuns[i - 1]} til ${longRuns[i]} km i oppbyggingsuke ${i + 1}`
    );
  }
  assert.ok(
    longRuns.at(-1)! > longRuns[0],
    `langturen økte ikke gjennom oppbyggingen (${longRuns.join(", ")})`
  );
});
