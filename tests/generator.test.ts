import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/lib/generator";
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
  const peakKm = baseInput.weeklyKm * 1.3;

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
        const peakKm = weeklyKm * (targetRace === "maraton" ? 1.35 : 1.3);
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
