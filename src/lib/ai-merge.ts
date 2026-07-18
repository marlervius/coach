import type { DayType, Plan } from "./types";

/**
 * AI-en får returnere tekstfeltene (tittel, beskrivelse, ukefokus) pluss
 * økttype. Fart og pulssone settes av serveren ut fra økttypen, så
 * fargemerking og soner alltid stemmer med innholdet i økta.
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
        required: ["nr", "focus", "days"],
        properties: {
          nr: { type: "integer" },
          focus: { type: "string" },
          days: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["date", "type", "title", "desc"],
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
    focus: string;
    days: Array<{ date: string; type?: string; title: string; desc: string }>;
  }>;
}

/** Økttyper AI-en kan veksle mellom. Hvile- og konkurransedager er fredet. */
const RUNNING_TYPES: ReadonlySet<DayType> = new Set([
  "rolig",
  "langtur",
  "intervall",
  "terskel",
  "repetisjoner",
  "maratonfart",
]);

/** Hvilken treningsfart (PaceCard-nøkkel) hver økttype hører til. */
const TYPE_TO_PACE_KEY: Partial<Record<DayType, string>> = {
  rolig: "E",
  langtur: "E",
  maratonfart: "M",
  terskel: "T",
  intervall: "I",
  repetisjoner: "R",
};

function aiText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} mangler`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} har ugyldig lengde`);
  return text;
}

export function mergeAiImprovements(plan: Plan, value: unknown): Plan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI-svaret hadde feil struktur");
  }
  const result = value as Partial<AiImprovement>;
  if (!Array.isArray(result.weeks) || result.weeks.length !== plan.weeks.length) {
    throw new Error("AI-svaret hadde feil antall uker");
  }
  const paceByKey = new Map(plan.paces.map((card) => [card.key, card]));

  const weeks = plan.weeks.map((week, weekIndex) => {
    const improvement = result.weeks![weekIndex];
    if (
      improvement?.nr !== week.nr ||
      !Array.isArray(improvement.days) ||
      improvement.days.length !== week.days.length
    ) {
      throw new Error(`AI-svaret hadde feil struktur i uke ${week.nr}`);
    }
    const days = week.days.map((day, dayIndex) => {
      const improvedDay = improvement.days[dayIndex];
      if (improvedDay?.date !== day.date) {
        throw new Error(`AI-svaret endret datoen ${day.date}`);
      }
      if (day.edited) return day;

      // Typebytte tillates kun mellom løpe-økttyper; hvile/konkurranse er fredet.
      let type = day.type;
      const proposed = improvedDay.type as DayType | undefined;
      if (
        proposed &&
        proposed !== day.type &&
        RUNNING_TYPES.has(proposed) &&
        RUNNING_TYPES.has(day.type)
      ) {
        type = proposed;
      }

      // Ved typebytte følger fart og pulssone den nye typen.
      let pace = day.pace;
      let hr = day.hr;
      if (type !== day.type) {
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
        title: aiText(improvedDay.title, "Økttittel", 160),
        desc: aiText(improvedDay.desc, "Øktbeskrivelse", 4_000),
      };
    });
    return {
      ...week,
      focus: aiText(improvement.focus, "Ukefokus", 600),
      days,
    };
  });
  return { ...plan, weeks };
}
