import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/lib/generator";
import { auditPlan } from "../src/lib/plan-quality";
import { inferRunningType } from "../src/lib/training-type";
import type { ProgramInput } from "../src/lib/types";

const input: ProgramInput = {
  athleteName: "Erik",
  targetRace: "halvmaraton",
  vdot: 35,
  goalTimeSec: 7_140,
  experienceLevel: "mosjonist",
  weeks: 10,
  daysPerWeek: 4,
  weeklyKm: 25,
  startDate: "2026-07-20",
};

const context = {
  daysPerWeek: input.daysPerWeek,
  weeklyKm: input.weeklyKm,
  targetRace: input.targetRace,
  goalTimeSec: input.goalTimeSec,
  experienceLevel: input.experienceLevel,
};

test("generatoren lager en plan som består fagkontrollen", () => {
  const report = auditPlan(generatePlan(input), context);
  assert.equal(
    report.issues.filter((issue) => issue.severity === "error").length,
    0,
    report.issues.map((issue) => issue.desc).join("\n")
  );
  assert.equal(report.ready, true);
});

test("fagkontrollen finner feil type, fart, volum og konkurranseuke", () => {
  const plan = generatePlan(input);
  const threshold = plan.weeks[2].days.find((day) => day.type === "rolig")!;
  threshold.type = "terskel";
  threshold.title = "Terskel 3 × 3 km";
  threshold.desc = "3 × 3 km i T-fart.";
  threshold.pace = plan.paces.find((pace) => pace.key === "E")!.range;
  plan.weeks[4].km = 40;
  plan.weeks.at(-1)!.days.forEach((day) => {
    if (day.type !== "konkurranse") {
      day.type = "hvile";
      day.km = 0;
    }
  });

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("pace-type-mismatch"));
  assert.ok(codes.has("threshold-dose"));
  assert.ok(codes.has("volume-spike"));
  assert.ok(codes.has("race-week-frequency"));
});

test("fagkontrollen avviser falsk restitusjonsuke og flere langturer", () => {
  const plan = generatePlan(input);
  const recoveryWeek = plan.weeks.find((week) =>
    week.phaseName.includes("restitusjonsuke")
  )!;
  const previousWeek = plan.weeks[recoveryWeek.nr - 2];
  recoveryWeek.km = previousWeek.km;
  const easy = recoveryWeek.days.find((day) => day.type === "rolig")!;
  easy.type = "langtur";
  easy.title = "Rolig langkjøring + stigningsløp";

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("recovery-week-volume"));
  assert.ok(codes.has("long-run-count"));
  assert.ok(codes.has("type-content-mismatch"));
});

test("fagkontrollen teller progressiv langtur som harddag", () => {
  const plan = generatePlan(input);
  const week = plan.weeks.find((candidate) => {
    const quality = candidate.days.filter((day) =>
      ["intervall", "terskel", "repetisjoner", "maratonfart"].includes(day.type)
    );
    return quality.length === 2;
  })!;
  const longRun = week.days.find((day) => day.type === "langtur")!;
  longRun.desc += " Avslutt progressivt i M-fart; denne delen er en harddag.";

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("too-many-quality-days"));
});

test("fagkontrollen finner urealistisk distanse og løpeøkt som egentlig er hvile", () => {
  const plan = generatePlan(input);
  const quality = plan.weeks
    .flatMap((week) => week.days)
    .find((day) => ["intervall", "terskel"].includes(day.type))!;
  quality.type = "terskel";
  quality.title = "3 × 4 min terskel";
  quality.desc = "Oppvarming, 3 × 4 min i T-fart og nedjogg.";
  quality.km = 11.5;

  const raceWeek = plan.weeks.at(-1)!;
  const easy = raceWeek.days.find((day) => day.type === "rolig")!;
  easy.title = "Hvile";
  easy.desc = "Ingen løping i dag.";
  easy.km = 0;

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("session-distance"));
  assert.ok(codes.has("running-rest-mismatch"));
  assert.ok(codes.has("race-week-frequency"));
});

test("fagkontrollen finner tekst som oppgir en annen type enn fargekoden", () => {
  const plan = generatePlan(input);
  const longRun = plan.weeks[0].days.find((day) => day.type === "langtur")!;
  longRun.desc += " Økten er endret type til 'maratonfart'.";

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("declared-type-mismatch"));
});

test("fagkontrollen finner glemt kilometerverdi i overskrift eller beskrivelse", () => {
  const plan = generatePlan(input);
  const easy = plan.weeks[0].days.find((day) => day.type === "rolig")!;
  easy.km += 2;

  const codes = new Set(auditPlan(plan, context).issues.map((issue) => issue.code));
  assert.ok(codes.has("distance-text-mismatch"));
});

test("typeinferensen skiller rolig langkjøring og blandet T/M-fart riktig", () => {
  assert.equal(
    inferRunningType("Rolig langkjøring + stigningsløp", "6 km lett i E-fart."),
    "rolig"
  );
  assert.equal(
    inferRunningType("Fartsveksling: 25 min T/M-fart", "Veksle mellom T- og M-fart."),
    "terskel"
  );
  assert.equal(
    inferRunningType("Langtur med M-fart: 13 km totalt", "Avslutt 3 km i M-fart."),
    "langtur"
  );
  assert.equal(
    inferRunningType("Rolig langtur 10 km", "Hold E-fart hele veien."),
    "langtur"
  );
  assert.equal(inferRunningType("Hvile", "Ingen løping i dag."), "hvile");
});

test("generatoren består fagkontrollen på tvers av distanser og frekvenser", () => {
  for (const targetRace of ["3000", "5000", "10000", "halvmaraton", "maraton"]) {
    for (const daysPerWeek of [3, 4, 5, 6, 7]) {
      const matrixInput: ProgramInput = {
        ...input,
        targetRace,
        weeks: 12,
        daysPerWeek,
        weeklyKm: Math.max(25, daysPerWeek * 6),
      };
      const report = auditPlan(generatePlan(matrixInput), {
        ...context,
        targetRace,
        daysPerWeek,
        weeklyKm: matrixInput.weeklyKm,
      });
      assert.equal(
        report.ready,
        true,
        `${targetRace}/${daysPerWeek}: ${report.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => `${issue.code}: ${issue.desc}`)
          .join("\n")}`
      );
    }
  }
});
