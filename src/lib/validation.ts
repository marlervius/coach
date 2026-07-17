import { isoDayOfWeek, isValidIsoDate } from "./date";
import type { DayType, Plan, PlanDay, ProgramInput } from "./types";
import { DISTANCES } from "./vdot";

const DAY_TYPES = new Set<DayType>([
  "hvile",
  "rolig",
  "langtur",
  "intervall",
  "terskel",
  "repetisjoner",
  "maratonfart",
  "konkurranse",
]);

export class ValidationError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Ugyldig datastruktur");
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ValidationError(`${field} må være tekst`);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new ValidationError(`${field} må ha mellom ${min} og ${max} tegn`);
  }
  return result;
}

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return boundedString(value, field, 0, max);
}

function boundedNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integer = false
): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new ValidationError(`${field} må være ${integer ? "et heltall" : "et tall"} mellom ${min} og ${max}`);
  }
  return result;
}

export function parseProgramInput(formData: FormData): ProgramInput {
  const targetRace = String(formData.get("targetRace") ?? "");
  if (!(targetRace in DISTANCES)) throw new ValidationError("Velg en gyldig konkurransedistanse");

  const startDate = String(formData.get("startDate") ?? "");
  if (!isValidIsoDate(startDate)) throw new ValidationError("Velg en gyldig startdato");
  if (isoDayOfWeek(startDate) !== 1) throw new ValidationError("Startdato må være en mandag");

  const daysPerWeek = boundedNumber(formData.get("daysPerWeek"), "Økter per uke", 3, 7, true);
  const weeklyKm = boundedNumber(formData.get("weeklyKm"), "Ukesvolum", 10, 200);
  if (weeklyKm < daysPerWeek * 3) {
    throw new ValidationError(`Ukesvolum må være minst ${daysPerWeek * 3} km for ${daysPerWeek} økter`);
  }

  const hrValue = formData.get("hrMax");
  return {
    athleteName: boundedString(formData.get("athleteName"), "Utøverens navn", 1, 100),
    targetRace,
    vdot: boundedNumber(formData.get("vdot"), "VDOT", 20, 85),
    weeks: boundedNumber(formData.get("weeks"), "Antall uker", 2, 30, true),
    daysPerWeek,
    weeklyKm,
    hrMax: hrValue ? boundedNumber(hrValue, "Makspuls", 120, 230, true) : null,
    startDate,
    notes: optionalString(formData.get("notes"), "Notater", 2_000),
  };
}

function editableDay(value: unknown, current: PlanDay): PlanDay {
  const day = record(value);
  if (day.date !== current.date || day.dow !== current.dow) {
    throw new ValidationError("Datoer og ukedager kan ikke endres");
  }
  if (typeof day.type !== "string" || !DAY_TYPES.has(day.type as DayType)) {
    throw new ValidationError("Ugyldig økttype");
  }

  const next: PlanDay = {
    ...current,
    type: day.type as DayType,
    title: boundedString(day.title, "Økttittel", 1, 160),
    desc: boundedString(day.desc, "Øktbeskrivelse", 0, 4_000),
    km: boundedNumber(day.km, "Distanse", 0, 300),
    pace: optionalString(day.pace, "Fart", 160),
    hr: optionalString(day.hr, "Pulssone", 200),
  };
  const changed = (
    ["type", "title", "desc", "km", "pace", "hr"] as const
  ).some((key) => next[key] !== current[key]);
  next.edited = current.edited || changed || undefined;
  return next;
}

export function sanitizePlanUpdate(value: unknown, current: Plan): Plan {
  const candidate = record(value);
  if (!Array.isArray(candidate.weeks) || candidate.weeks.length !== current.weeks.length) {
    throw new ValidationError("Planen har feil antall uker");
  }
  const candidateWeeks = candidate.weeks;

  const weeks = current.weeks.map((currentWeek, weekIndex) => {
    const week = record(candidateWeeks[weekIndex]);
    if (!Array.isArray(week.days) || week.days.length !== currentWeek.days.length) {
      throw new ValidationError(`Uke ${currentWeek.nr} har feil antall dager`);
    }
    const candidateDays = week.days;
    const days = currentWeek.days.map((day, dayIndex) => editableDay(candidateDays[dayIndex], day));
    const km = Math.round(days.reduce((sum, day) => sum + day.km, 0) * 2) / 2;
    return { ...currentWeek, km, days };
  });

  return { paces: current.paces, weeks };
}

export function parseRevision(value: unknown): number {
  return boundedNumber(value, "Revisjon", 0, Number.MAX_SAFE_INTEGER, true);
}

export function parseAiInstruction(value: unknown): string | undefined {
  return optionalString(value, "Beskjed til AI-en", 2_000);
}
