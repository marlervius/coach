import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/lib/generator";
import { auditPlan } from "../src/lib/plan-quality";
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
