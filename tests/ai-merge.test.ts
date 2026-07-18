import test from "node:test";
import assert from "node:assert/strict";
import { mergeAiImprovements } from "../src/lib/ai-merge";
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
        km: 13,
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

function aiWeeks(dayOverrides: Partial<{ type: string; title: string; desc: string }> = {}) {
  return {
    weeks: [
      {
        nr: 1,
        focus: "Nytt fokus",
        days: [
          { date: "2026-07-20", type: "hvile", title: "Hvile", desc: "Hvil godt." },
          {
            date: "2026-07-21",
            type: "rolig",
            title: "Rolig 6.5 km",
            desc: "Fin tur.",
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

test("hviledager kan ikke gjøres om til løpeøkter", () => {
  const ai = aiWeeks();
  ai.weeks[0].days[0].type = "rolig";
  const merged = mergeAiImprovements(makePlan(), ai);
  assert.equal(merged.weeks[0].days[0].type, "hvile");
});

test("ingen dag kan gjøres om til konkurranse", () => {
  const merged = mergeAiImprovements(makePlan(), aiWeeks({ type: "konkurranse" }));
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "rolig");
  assert.equal(day.pace, "6:30–7:28/km");
});

test("manuelt endrede dager røres ikke", () => {
  const plan = makePlan();
  plan.weeks[0].days[1].edited = true;
  const merged = mergeAiImprovements(
    plan,
    aiWeeks({ type: "intervall", title: "Noe annet", desc: "Noe annet." })
  );
  const day = merged.weeks[0].days[1];
  assert.equal(day.type, "rolig");
  assert.equal(day.title, "Rolig 6.5 km");
  assert.equal(day.desc, "Rolig tur.");
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
