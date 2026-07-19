import test from "node:test";
import assert from "node:assert/strict";
import { buildAiChangeReport, mergeAiImprovements } from "../src/lib/ai-merge";
import type { Plan } from "../src/lib/types";

function makePlan(): Plan {
  return {
    guidance: {
      methodology: "Kontinuitet først.",
      principles: [{ title: "Styr etter innsats", desc: "Juster etter forholdene." }],
    },
    paces: [
      { key: "E", label: "E – Rolig", range: "6:30–7:28/km", hr: "65–79 % av makspuls", desc: "" },
      { key: "T", label: "T – Terskel", range: "5:37–5:46/km", hr: "88–92 % av makspuls", desc: "" },
      { key: "I", label: "I – Intervall", range: "5:05–5:18/km", hr: "92–100 % av makspuls", desc: "" },
      { key: "R", label: "R – Repetisjoner", range: "4:44–4:55/km", hr: "Styres av fart, ikke puls", desc: "" },
    ],
    weeks: [
      {
        nr: 1,
        phase: 2,
        phaseName: "Tidlig kvalitet",
        focus: "Fokus",
        km: 6.5,
        days: [
          { dow: 0, date: "2026-07-20", type: "hvile", title: "Hvile", desc: "Full hviledag.", km: 0 },
          {
            dow: 1,
            date: "2026-07-21",
            type: "rolig",
            title: "Rolig 6.5 km",
            desc: "Rolig tur.",
            km: 6.5,
            pace: "6:30–7:28/km",
            hr: "65–79 % av makspuls",
          },
        ],
      },
    ],
  };
}

function aiWeeks(
  dayOverrides: Partial<{
    type: string;
    title: string;
    desc: string;
    km: number;
    pace: string;
    hr: string;
  }> = {}
) {
  return {
    report: {
      summary: "Planen er gjort mer konsistent.",
      changes: [
        {
          weekNr: 1,
          date: "2026-07-21",
          change: "Den rolige økten ble oppdatert.",
          reason: "For at øktens felter skal stemme sammen.",
        },
      ],
    },
    weeks: [
      {
        nr: 1,
        phaseName: "Tidlig kvalitet",
        focus: "Nytt fokus",
        days: [
          {
            date: "2026-07-20",
            type: "hvile",
            title: "Hvile",
            desc: "Hvil godt.",
            km: 0,
            pace: "",
            hr: "",
          },
          {
            date: "2026-07-21",
            type: "rolig",
            title: "Rolig 6.5 km",
            desc: "Fin tur.",
            km: 6.5,
            pace: "6:30–7:28/km",
            hr: "65–79 % av makspuls",
            ...dayOverrides,
          },
        ],
      },
    ],
  };
}

test("typebytte til terskel oppdaterer badge, fart og pulssone", () => {
  const merged = mergeAiImprovements(
    makePlan(),
    aiWeeks({ type: "terskel", title: "Terskel 2 × 6 min", desc: "Terskeløkt." })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "terskel");
  assert.equal(day.pace, "5:37–5:46/km");
  assert.equal(day.hr, "88–92 % av makspuls");
  assert.equal(day.title, "Terskel 2 × 6 min");
  assert.equal(day.km, 6.5);
  assert.equal(merged.guidance?.methodology, "Kontinuitet først.");
});

test("serveren retter type når AI skriver repetisjoner men returnerer rolig", () => {
  const merged = mergeAiImprovements(
    makePlan(),
    aiWeeks({
      type: "rolig",
      title: "6 × 200 m repetisjoner",
      desc: "Oppvarming rolig. Løp 6 × 200 m i R-fart med full pause.",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "repetisjoner");
  assert.equal(day.pace, "4:44–4:55/km");
  assert.equal(day.hr, "Styres av fart, ikke puls");
});

test("innholdet kan også korrigere feil foreslått intervall til rolig", () => {
  const merged = mergeAiImprovements(
    makePlan(),
    aiWeeks({
      type: "intervall",
      title: "Rolig restitusjonsløp",
      desc: "Løp hele turen lett i E-fart.",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "rolig");
  assert.equal(day.pace, "6:30–7:28/km");
  assert.equal(day.hr, "65–79 % av makspuls");
});

test("AI kan gjøre en hviledag om til en rolig løpeøkt", () => {
  const ai = aiWeeks();
  ai.weeks[0].days[0].type = "rolig";
  ai.weeks[0].days[0].title = "Rolig 4 km";
  ai.weeks[0].days[0].desc = "Løp 4 km lett i E-fart.";
  ai.weeks[0].days[0].km = 4;
  const merged = mergeAiImprovements(makePlan(), ai);
  const day = merged.weeks[0].days[0];
  assert.equal(day.type, "rolig");
  assert.equal(day.km, 4);
  assert.equal(day.pace, "6:30–7:28/km");
  assert.equal(day.hr, "65–79 % av makspuls");
});

test("ingen dag kan gjøres om til konkurranse", () => {
  const merged = mergeAiImprovements(makePlan(), aiWeeks({ type: "konkurranse" }));
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "rolig");
  assert.equal(day.pace, "6:30–7:28/km");
});

test("eksisterende konkurransedag beholder type, distanse, fart og puls", () => {
  const plan = makePlan();
  plan.weeks[0].days[1] = {
    ...plan.weeks[0].days[1],
    type: "konkurranse",
    title: "KONKURRANSE – 5 km",
    desc: "Løpsdag.",
    km: 5,
    pace: "5:00/km",
    hr: "Konkurranseinnsats",
  };
  const merged = mergeAiImprovements(
    plan,
    aiWeeks({
      type: "hvile",
      title: "Hvile",
      desc: "Ingen løping.",
      km: 0,
      pace: "",
      hr: "",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "konkurranse");
  assert.equal(day.km, 5);
  assert.equal(day.pace, "5:00/km");
  assert.equal(day.hr, "Konkurranseinnsats");
});

test("manuelt endrede dager blir også kvalitetssikret", () => {
  const plan = makePlan();
  plan.weeks[0].days[1].edited = true;
  const merged = mergeAiImprovements(
    plan,
    aiWeeks({
      type: "intervall",
      title: "5 × 3 min intervall",
      desc: "Kontrollert I-fart med rolig joggepause.",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "intervall");
  assert.equal(day.title, "5 × 3 min intervall");
  assert.equal(day.pace, "5:05–5:18/km");
  assert.equal(day.edited, true);
});

test("AI kan rette distanse og serveren regner ukesoverskriften på nytt", () => {
  const plan = makePlan();
  plan.weeks[0].km = 99;
  const merged = mergeAiImprovements(
    plan,
    aiWeeks({
      title: "Rolig 8 km",
      desc: "Løp 8 km kontrollert i E-fart.",
      km: 8,
    })
  );
  assert.equal(merged.weeks[0].days[1].km, 8);
  assert.equal(merged.weeks[0].km, 8);
});

test("endringsrapporten bygges fra det som faktisk ble lagret", () => {
  const before = makePlan();
  const ai = aiWeeks({
    title: "Rolig 8 km",
    desc: "Løp 8 km kontrollert i E-fart.",
    km: 8,
  });
  const after = mergeAiImprovements(before, ai);
  const report = buildAiChangeReport(before, after, ai);
  const day = report.changes.find((item) => item.date === "2026-07-21");

  assert.equal(report.summary, "Planen er gjort mer konsistent.");
  assert.match(day?.change ?? "", /Distanse: 6.5 → 8 km/);
  assert.match(day?.change ?? "", /Tittel:/);
  assert.equal(day?.reason, "For at øktens felter skal stemme sammen.");
  assert.ok(report.changes.some((item) => item.change.includes("Ukessum: 6.5 → 8 km")));
});

test("endringsrapport er obligatorisk", () => {
  const before = makePlan();
  const ai = aiWeeks();
  const after = mergeAiImprovements(before, ai);
  const withoutReport: Partial<typeof ai> = structuredClone(ai);
  delete withoutReport.report;
  assert.throws(() => buildAiChangeReport(before, after, withoutReport), /manglet endringsrapport/);
});

test("serveren retter ukessummen også når AI utelater en uke", () => {
  const plan = makePlan();
  plan.weeks.push({
    ...structuredClone(plan.weeks[0]),
    nr: 2,
    km: 99,
    days: plan.weeks[0].days.map((day) => ({
      ...day,
      date: day.date === "2026-07-20" ? "2026-07-27" : "2026-07-28",
    })),
  });
  const merged = mergeAiImprovements(plan, aiWeeks());
  assert.equal(merged.weeks[1].km, 6.5);
});

test("serveren normaliserer fart og puls fra korrigert økttype", () => {
  const merged = mergeAiImprovements(
    makePlan(),
    aiWeeks({
      type: "terskel",
      title: "3 × 8 min terskel",
      desc: "Kontrollert terskelarbeid.",
      pace: "feil fart",
      hr: "feil puls",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.pace, "5:37–5:46/km");
  assert.equal(day.hr, "88–92 % av makspuls");
});

test("hviledager holdes på null kilometer uten fart og puls", () => {
  const ai = aiWeeks();
  ai.weeks[0].days[0].km = 5;
  ai.weeks[0].days[0].pace = "5:00/km";
  ai.weeks[0].days[0].hr = "90 %";
  const merged = mergeAiImprovements(makePlan(), ai);
  const day = merged.weeks[0].days[0];
  assert.equal(day.km, 0);
  assert.equal(day.pace, undefined);
  assert.equal(day.hr, undefined);
});

test("AI kan rette en feilmerket nullkilometers løpedag til hvile", () => {
  const merged = mergeAiImprovements(
    makePlan(),
    aiWeeks({
      type: "hvile",
      title: "Hvile",
      desc: "Ingen løping i dag.",
      km: 0,
      pace: "",
      hr: "",
    })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "hvile");
  assert.equal(day.km, 0);
  assert.equal(day.pace, undefined);
  assert.equal(day.hr, undefined);
});

test("endret dato avvises", () => {
  const ai = aiWeeks();
  ai.weeks[0].days[1].date = "2026-07-22";
  assert.throws(() => mergeAiImprovements(makePlan(), ai), /endret datoen/);
});

test("dager kan komme i en annen rekkefølge og kobles fortsatt på dato", () => {
  const ai = aiWeeks({ title: "Rolig tur med ny tittel" });
  ai.weeks[0].days.reverse();
  const merged = mergeAiImprovements(makePlan(), ai);
  assert.equal(merged.weeks[0].days[0].title, "Hvile");
  assert.equal(merged.weeks[0].days[1].title, "Rolig tur med ny tittel");
});

test("utelatte dager beholdes uendret i stedet for å velte hele AI-kallet", () => {
  const ai = aiWeeks({ title: "Oppdatert rolig tur" });
  ai.weeks[0].days.splice(0, 1);
  const merged = mergeAiImprovements(makePlan(), ai);
  assert.equal(merged.weeks[0].days[0].desc, "Full hviledag.");
  assert.equal(merged.weeks[0].days[1].title, "Oppdatert rolig tur");
});

test("dupliserte datoer avvises", () => {
  const ai = aiWeeks();
  ai.weeks[0].days.push({ ...ai.weeks[0].days[1] });
  assert.throws(() => mergeAiImprovements(makePlan(), ai), /dupliserte datoen/);
});
