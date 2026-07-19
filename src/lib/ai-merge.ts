import { DAY_NAMES, TYPE_LABELS } from "./types";
import type { AiChangeReport, DayType, Plan, PlanDay } from "./types";
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
  required: ["weeks", "report"],
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
    report: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "changes"],
      properties: {
        summary: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["weekNr", "date", "change", "reason"],
            properties: {
              weekNr: { type: "integer" },
              date: { type: "string" },
              change: { type: "string" },
              reason: { type: "string" },
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
  report?: {
    summary?: string;
    changes?: Array<{
      weekNr?: number;
      date?: string;
      change?: string;
      reason?: string;
    }>;
  };
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
      let km = aiKm(improvedDay.km, day.km);

      // AI-en kan endre alle ikke-konkurransedager, også mellom hvile og løping.
      // Konkurransedagen er fortsatt en strukturell sikkerhetsgrense.
      let type = day.type;
      const proposed = improvedDay.type as DayType | undefined;
      if (day.type !== "konkurranse") {
        if (proposed === "hvile" || (proposed && RUNNING_TYPES.has(proposed))) {
          type = proposed;
        }

        // Serveren korrigerer klassifiseringen hvis innholdet motsier typefeltet.
        const inferred = inferRunningType(title, desc);
        if (inferred && RUNNING_TYPES.has(inferred)) type = inferred;
        if (inferred === "hvile" || proposed === "hvile") type = "hvile";
      }

      let pace = aiOptionalText(improvedDay.pace, "Fart", 160);
      let hr = aiOptionalText(improvedDay.hr, "Pulssone", 200);

      // Hvile og konkurransedistanse er strukturelle sikkerhetsgrenser.
      if (day.type === "konkurranse") {
        type = "konkurranse";
        km = day.km;
        pace = day.pace;
        hr = day.hr;
      } else if (type === "hvile") {
        km = 0;
        pace = undefined;
        hr = undefined;
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

function dayChanges(before: PlanDay, after: PlanDay): string[] {
  const changes: string[] = [];
  if (before.type !== after.type) {
    changes.push(`Økttype: ${TYPE_LABELS[before.type]} → ${TYPE_LABELS[after.type]}.`);
  }
  if (before.title !== after.title) changes.push(`Tittel: «${before.title}» → «${after.title}».`);
  if (before.desc !== after.desc) changes.push("Øktbeskrivelsen ble oppdatert.");
  if (before.km !== after.km) changes.push(`Distanse: ${before.km} → ${after.km} km.`);
  if (before.pace !== after.pace) {
    changes.push(`Fart: ${before.pace ?? "ikke angitt"} → ${after.pace ?? "ikke angitt"}.`);
  }
  if (before.hr !== after.hr) {
    changes.push(`Puls: ${before.hr ?? "ikke angitt"} → ${after.hr ?? "ikke angitt"}.`);
  }
  return changes;
}

function fallbackReason(changes: string[]): string {
  const text = changes.join(" ");
  if (text.includes("Økttype:") || text.includes("Fart:") || text.includes("Puls:")) {
    return "For at økttype, fargekode og intensitetssone skal samsvare med øktens innhold.";
  }
  if (text.includes("Distanse:") || text.includes("Tittel:")) {
    return "For at distanse, overskrift og øktbeskrivelse skal være innbyrdes konsistente.";
  }
  return "For å gjøre planen tydeligere og faglig mer presis for utøveren.";
}

export function buildAiChangeReport(before: Plan, after: Plan, value: unknown): AiChangeReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI-rapporten hadde feil struktur");
  }
  const report = (value as Partial<AiImprovement>).report;
  if (!report || !Array.isArray(report.changes)) {
    throw new Error("AI-svaret manglet endringsrapport");
  }
  const modelSummary = aiText(report.summary, "Rapportsammendrag", 1_000);
  const reasons = new Map<string, string>();
  for (const item of report.changes) {
    const reportWeek = before.weeks.find((week) => week.nr === item.weekNr);
    if (!Number.isInteger(item.weekNr) || !reportWeek) {
      throw new Error("AI-rapporten hadde ukjent ukenummer");
    }
    const date = aiOptionalText(item.date, "Rapportdato", 10);
    if (date && !reportWeek.days.some((day) => day.date === date)) {
      throw new Error("AI-rapporten hadde ukjent dato");
    }
    aiText(item.change, "Rapportendring", 1_000);
    const reason = aiText(item.reason, "Rapportbegrunnelse", 1_000);
    reasons.set(`${item.weekNr}:${date ?? ""}`, reason);
  }

  const changes: AiChangeReport["changes"] = [];
  for (let weekIndex = 0; weekIndex < before.weeks.length; weekIndex++) {
    const oldWeek = before.weeks[weekIndex];
    const newWeek = after.weeks[weekIndex];
    const weekChanges: string[] = [];
    if (oldWeek.phaseName !== newWeek.phaseName) {
      weekChanges.push(`Fasenavn: «${oldWeek.phaseName}» → «${newWeek.phaseName}».`);
    }
    if (oldWeek.focus !== newWeek.focus) weekChanges.push("Ukefokuset ble oppdatert.");
    if (oldWeek.km !== newWeek.km) weekChanges.push(`Ukessum: ${oldWeek.km} → ${newWeek.km} km.`);
    if (weekChanges.length > 0) {
      changes.push({
        weekNr: oldWeek.nr,
        scope: `Uke ${oldWeek.nr}`,
        change: weekChanges.join(" "),
        reason:
          reasons.get(`${oldWeek.nr}:`) ??
          (weekChanges.some((change) => change.startsWith("Ukessum:"))
            ? "Ukesummen er beregnet på nytt fra distansene i ukens økter."
            : "For å gjøre ukens progresjon og hensikt tydeligere."),
      });
    }

    for (let dayIndex = 0; dayIndex < oldWeek.days.length; dayIndex++) {
      const oldDay = oldWeek.days[dayIndex];
      const newDay = newWeek.days[dayIndex];
      const actualChanges = dayChanges(oldDay, newDay);
      if (actualChanges.length === 0) continue;
      changes.push({
        weekNr: oldWeek.nr,
        date: oldDay.date,
        scope: `Uke ${oldWeek.nr}, ${DAY_NAMES[oldDay.dow].toLowerCase()} ${oldDay.date}`,
        change: actualChanges.join(" "),
        reason: reasons.get(`${oldWeek.nr}:${oldDay.date}`) ?? fallbackReason(actualChanges),
      });
    }
  }

  return {
    summary:
      changes.length === 0
        ? "AI-en gjennomgikk hele planen. Ingen endringer var nødvendige."
        : modelSummary,
    changes,
  };
}
