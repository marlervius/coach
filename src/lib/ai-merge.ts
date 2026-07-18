import type { DayType, Plan } from "./types";
import {
  inferRunningType,
  RUNNING_TYPES,
  TYPE_TO_PACE_KEY,
} from "./training-type";

/**
 * AI-en får foreslå alle innholdsfeltene i planen. Datoer, ukedager,
 * ukenummer og fase-ID er fortsatt strukturelle nøkler og kan ikke endres.
 * Serveren normaliserer økttype, soner og ukesvolum etterpå.
 */
export const IMPROVEMENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["weeks"],
  properties: {
    weeks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "phaseName", "focus", "days"],
        properties: {
          nr: { type: "integer" },
          phaseName: { type: "string" },
          focus: { type: "string" },
          days: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["date", "type", "title", "desc", "km", "pace", "hr"],
              properties: {
                date: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "hvile",
                    "rolig",
                    "langtur",
                    "intervall",
                    "terskel",
                    "repetisjoner",
                    "maratonfart",
                    "konkurranse",
                  ],
                },
                title: { type: "string" },
                desc: { type: "string" },
                km: { type: "number", minimum: 0, maximum: 300 },
                pace: { type: "string" },
                hr: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

interface AiImprovement {
  weeks: Array<{
    nr: number;
    phaseName?: string;
    focus?: string;
    days: Array<{
      date: string;
      type?: string;
      title: string;
      desc: string;
      km?: number;
      pace?: string;
      hr?: string;
    }>;
  }>;
}

function aiText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} mangler`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} har ugyldig lengde`);
  return text;
}

function aiOptionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} har feil format`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${field} har ugyldig lengde`);
  return text || undefined;
}

function aiKm(value: unknown, current: number): number {
  if (value === undefined) return current;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 300) {
    throw new Error("Distanse har ugyldig verdi");
  }
  return Math.round(value * 2) / 2;
}

export function mergeAiImprovements(plan: Plan, value: unknown): Plan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI-svaret hadde feil struktur");
  }
  const result = value as Partial<AiImprovement>;
  if (!Array.isArray(result.weeks) || result.weeks.length === 0) {
    throw new Error("AI-svaret manglet uker");
  }
  const paceByKey = new Map(plan.paces.map((card) => [card.key, card]));
  const planWeeksByNr = new Map(plan.weeks.map((week) => [week.nr, week]));
  const improvementsByWeek = new Map<number, AiImprovement["weeks"][number]>();

  for (const improvement of result.weeks) {
    if (
      !Number.isInteger(improvement?.nr) ||
      !planWeeksByNr.has(improvement.nr) ||
      !Array.isArray(improvement.days)
    ) {
      throw new Error(`AI-svaret hadde ukjent ukenummer ${improvement?.nr ?? ""}`);
    }
    if (improvementsByWeek.has(improvement.nr)) {
      throw new Error(`AI-svaret dupliserte uke ${improvement.nr}`);
    }

    const allowedDates = new Set(
      planWeeksByNr.get(improvement.nr)!.days.map((day) => day.date)
    );
    const seenDates = new Set<string>();
    for (const day of improvement.days) {
      if (typeof day?.date !== "string" || !allowedDates.has(day.date)) {
        throw new Error(`AI-svaret endret datoen ${day?.date ?? ""}`);
      }
      if (seenDates.has(day.date)) {
        throw new Error(`AI-svaret dupliserte datoen ${day.date}`);
      }
      seenDates.add(day.date);
    }
    improvementsByWeek.set(improvement.nr, improvement);
  }

  const weeks = plan.weeks.map((week) => {
    const improvement = improvementsByWeek.get(week.nr);
    if (!improvement) {
      const km = Math.round(week.days.reduce((sum, day) => sum + day.km, 0) * 2) / 2;
      return { ...week, km };
    }
    const improvementsByDate = new Map(
      improvement.days.map((day) => [day.date, day])
    );
    const days = week.days.map((day) => {
      const improvedDay = improvementsByDate.get(day.date);
      if (!improvedDay) return day;

      const title = aiText(improvedDay.title, "Økttittel", 160);
      const desc = aiText(improvedDay.desc, "Øktbeskrivelse", 4_000);

      // Typebytte tillates kun mellom løpe-økttyper; hvile/konkurranse er fredet.
      let type = day.type;
      const proposed = improvedDay.type as DayType | undefined;
      if (RUNNING_TYPES.has(day.type)) {
        if (proposed && RUNNING_TYPES.has(proposed)) type = proposed;

        // Serveren korrigerer klassifiseringen hvis innholdet motsier AI-feltet.
        const inferred = inferRunningType(title, desc);
        if (inferred) type = inferred;
      }

      let km = aiKm(improvedDay.km, day.km);
      let pace = aiOptionalText(improvedDay.pace, "Fart", 160);
      let hr = aiOptionalText(improvedDay.hr, "Pulssone", 200);

      // Hvile og konkurransedistanse er strukturelle sikkerhetsgrenser.
      if (day.type === "hvile") {
        km = 0;
        pace = undefined;
        hr = undefined;
      } else if (day.type === "konkurranse") {
        km = day.km;
      } else {
        // Ordinære løpeøkter bruker planens VDOT-beregnede standardsone.
        // Dermed kan ikke fritekst og visningsfelter havne i ulike intensiteter.
        const card = paceByKey.get(TYPE_TO_PACE_KEY[type] ?? "");
        if (card) {
          pace = card.range;
          hr = card.hr;
        }
      }

      return {
        ...day,
        type,
        pace,
        hr,
        title,
        desc,
        km,
      };
    });
    const km = Math.round(days.reduce((sum, day) => sum + day.km, 0) * 2) / 2;
    return {
      ...week,
      phaseName:
        improvement.phaseName === undefined
          ? week.phaseName
          : aiText(improvement.phaseName, "Fasenavn", 160),
      focus:
        improvement.focus === undefined
          ? week.focus
          : aiText(improvement.focus, "Ukefokus", 600),
      km,
      days,
    };
  });
  return { ...plan, weeks };
}
