import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/lib/generator";
import {
  parseProgramInput,
  sanitizePlanUpdate,
  ValidationError,
} from "../src/lib/validation";

function validForm(): FormData {
  const form = new FormData();
  form.set("athleteName", "Ingrid Hansen");
  form.set("targetRace", "5000");
  form.set("vdot", "50");
  form.set("weeks", "12");
  form.set("daysPerWeek", "3");
  form.set("weeklyKm", "15");
  form.set("startDate", "2026-07-20");
  return form;
}

test("gyldig programinput aksepteres", () => {
  const input = parseProgramInput(validForm());
  assert.equal(input.startDate, "2026-07-20");
  assert.equal(input.weeklyKm, 15);
  assert.equal(input.experienceLevel, "mosjonist");
});

test("måltid og erfaringsnivå parses strukturert", () => {
  const form = validForm();
  form.set("goalTime", "22:00");
  form.set("experienceLevel", "erfaren");
  const input = parseProgramInput(form);
  assert.equal(input.goalTimeSec, 1_320);
  assert.equal(input.experienceLevel, "erfaren");
});

test("urealistisk måltid avvises", () => {
  const form = validForm();
  form.set("goalTime", "0:05:00");
  assert.throws(() => parseProgramInput(form), ValidationError);
});

test("startdato må være mandag", () => {
  const form = validForm();
  form.set("startDate", "2026-07-22");
  assert.throws(() => parseProgramInput(form), ValidationError);
});

test("ukesvolum må passe antall økter", () => {
  const form = validForm();
  form.set("daysPerWeek", "7");
  form.set("weeklyKm", "10");
  assert.throws(() => parseProgramInput(form), ValidationError);
});

test("planoppdatering bevarer struktur og markerer endret dag", () => {
  const input = parseProgramInput(validForm());
  const current = generatePlan(input);
  const candidate = structuredClone(current);
  candidate.weeks[0].days[0].title = "Tilpasset hviledag";

  const updated = sanitizePlanUpdate(candidate, current);
  assert.equal(updated.weeks[0].days[0].title, "Tilpasset hviledag");
  assert.equal(updated.weeks[0].days[0].edited, true);
  assert.deepEqual(updated.paces, current.paces);
  assert.deepEqual(updated.guidance, current.guidance);
  assert.equal(updated.weeks[0].days[0].date, current.weeks[0].days[0].date);
});

test("planoppdatering kan ikke endre dato", () => {
  const input = parseProgramInput(validForm());
  const current = generatePlan(input);
  const candidate = structuredClone(current);
  candidate.weeks[0].days[0].date = "2026-07-21";
  assert.throws(() => sanitizePlanUpdate(candidate, current), ValidationError);
});
