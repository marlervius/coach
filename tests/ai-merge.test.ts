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
