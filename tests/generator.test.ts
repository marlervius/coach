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
  for (const targetRace of ["3000", "5000", "10000", "halvmaraton", "maraton"]) {
    const plan = generatePlan({ ...baseInput, targetRace });
    for (const week of plan.weeks) {
      const sum = Math.round(week.days.reduce((total, day) => total + day.km, 0) * 2) / 2;
      assert.equal(week.km, sum, `${targetRace}: feil ukesum i uke ${week.nr}`);
    }
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

test("tre løpedager gir maksimalt én kvalitetsøkt per uke", () => {
  const qualityTypes = new Set(["intervall", "terskel", "repetisjoner", "maratonfart"]);
  for (const targetRace of ["3000", "5000", "10000", "halvmaraton", "maraton"]) {
    const plan = generatePlan({
      ...baseInput,
      targetRace,
      daysPerWeek: 3,
      weeklyKm: 45,
    });
    for (const week of plan.weeks) {
      const qualityDays = week.days.filter((day) => qualityTypes.has(day.type));
      assert.ok(
        qualityDays.length <= 1,
        `${targetRace}, uke ${week.nr}: fikk ${qualityDays.length} kvalitetsøkter`
      );
    }
  }
});

test("konkurranseuka bruker en kort tune-up og aldri full fase-3-økt", () => {
  const plan = generatePlan({ ...baseInput, targetRace: "5000", daysPerWeek: 5, weeklyKm: 50 });
  const raceWeek = plan.weeks.at(-1)!;
  const quality = raceWeek.days.filter((day) =>
    ["intervall", "terskel", "repetisjoner", "maratonfart"].includes(day.type)
  );
  assert.equal(quality.length, 1);
  assert.match(quality[0].title, /400 m i konkurransefart/);
  assert.ok(quality[0].km <= 7);
  assert.equal(raceWeek.days.at(-1)?.type, "konkurranse");
});

test("maratonuka beholder korte aktiveringsøkter før løpet", () => {
  const plan = generatePlan({
    ...baseInput,
    targetRace: "maraton",
    daysPerWeek: 5,
    weeklyKm: 45,
  });
  const raceWeek = plan.weeks.at(-1)!;
  const preRaceRuns = raceWeek.days.filter(
    (day) => day.type !== "hvile" && day.type !== "konkurranse"
  );
  assert.ok(preRaceRuns.length >= 3, `fant bare ${preRaceRuns.length} økter før maraton`);
  assert.equal(raceWeek.days.at(-1)?.km, 42);
});

test("restitusjonsuker reduserer både totalvolum og kvalitetsøkt", () => {
  const plan = generatePlan({
    ...baseInput,
    targetRace: "5000",
    daysPerWeek: 5,
    weeklyKm: 50,
  });
  for (const week of plan.weeks.filter((candidate) =>
    candidate.phaseName.includes("restitusjonsuke")
  )) {
    const quality = week.days.filter((day) =>
      ["intervall", "terskel", "repetisjoner", "maratonfart"].includes(day.type)
    );
    assert.ok(quality.length <= 1);
    assert.ok(quality.every((day) => day.km <= 8));
  }
});

test("hovedøktene varieres gjennom den spesifikke fasen", () => {
  const plan = generatePlan({
    ...baseInput,
    targetRace: "5000",
    weeks: 16,
    daysPerWeek: 5,
    weeklyKm: 50,
  });
  const titles = plan.weeks
    .filter((week) => week.phase === 3 && !week.phaseName.includes("konkurranseuke"))
    .map((week) => week.days.find((day) => day.type === "intervall")?.title)
    .filter((title): title is string => Boolean(title));
  assert.ok(titles.length >= 3);
  assert.ok(new Set(titles).size >= 3, `for lite variasjon: ${titles.join(", ")}`);
});

test("planen inkluderer profesjonelle styringsregler for dagsform og restitusjon", () => {
  const plan = generatePlan(baseInput);
  assert.ok(plan.guidance);
  assert.ok(plan.guidance.principles.length >= 4);
  assert.ok(plan.guidance.principles.some((rule) => rule.desc.includes("Tapte økter")));
  assert.ok(plan.guidance.principles.some((rule) => rule.desc.includes("48 timer")));
});

test("konkurranseuka beholder valgt løpsfrekvens og bruker målfarten", () => {
  const goalTimeSec = 1 * 3600 + 59 * 60;
  const plan = generatePlan({
    ...baseInput,
    targetRace: "halvmaraton",
    weeks: 10,
    daysPerWeek: 4,
    weeklyKm: 25,
    goalTimeSec,
  });
  const raceWeek = plan.weeks.at(-1)!;
  const runs = raceWeek.days.filter((day) => day.type !== "hvile");
  const race = raceWeek.days.find((day) => day.type === "konkurranse")!;
  assert.equal(runs.length, 4);
  assert.equal(race.pace, "5:38/km");
  assert.ok(raceWeek.days.some((day) =>
    ["intervall", "terskel", "maratonfart"].includes(day.type)
  ));
});

test("nye løpere får maksimalt én tydelig kvalitetsdag per uke", () => {
  const plan = generatePlan({
    ...baseInput,
    weeks: 16,
    daysPerWeek: 5,
    weeklyKm: 45,
    experienceLevel: "ny",
  });
  for (const week of plan.weeks) {
    const quality = week.days.filter((day) =>
      ["intervall", "terskel", "repetisjoner", "maratonfart"].includes(day.type)
    );
    assert.ok(quality.length <= 1, `uke ${week.nr} har ${quality.length} hardøkter`);
  }
});
