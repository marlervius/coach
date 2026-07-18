export type DayType =
  | "hvile"
  | "rolig"
  | "langtur"
  | "intervall"
  | "terskel"
  | "repetisjoner"
  | "maratonfart"
  | "konkurranse";

export interface PlanDay {
  /** 0 = mandag … 6 = søndag */
  dow: number;
  /** ISO-dato yyyy-mm-dd */
  date: string;
  type: DayType;
  title: string;
  desc: string;
  km: number;
  pace?: string;
  hr?: string;
  /** Satt hvis coachen har overstyrt dagen manuelt */
  edited?: boolean;
}

export interface PlanWeek {
  nr: number;
  phase: 1 | 2 | 3 | 4;
  phaseName: string;
  focus: string;
  km: number;
  days: PlanDay[];
}

export interface PaceCard {
  key: string;
  label: string;
  range: string;
  hr: string;
  desc: string;
}

export interface CoachingPrinciple {
  title: string;
  desc: string;
}

export interface PlanGuidance {
  methodology: string;
  principles: CoachingPrinciple[];
}

export interface Plan {
  paces: PaceCard[];
  weeks: PlanWeek[];
  /** Praktiske regler som gjør planen trygg å styre etter i hverdagen. */
  guidance?: PlanGuidance;
}

export interface AiChangeReportItem {
  weekNr: number;
  date?: string;
  scope: string;
  change: string;
  reason: string;
}

export interface AiChangeReport {
  summary: string;
  changes: AiChangeReportItem[];
}

export interface ProgramInput {
  athleteName: string;
  targetRace: string;
  vdot: number;
  /** Valgfri måltid i sekunder. Treningsfarter styres fortsatt av nåværende VDOT. */
  goalTimeSec?: number | null;
  experienceLevel?: "ny" | "mosjonist" | "erfaren";
  weeks: number;
  daysPerWeek: number;
  weeklyKm: number;
  hrMax?: number | null;
  startDate: string; // ISO yyyy-mm-dd
  notes?: string;
}

export const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

export const TYPE_LABELS: Record<DayType, string> = {
  hvile: "Hvile",
  rolig: "Rolig løp",
  langtur: "Langtur",
  intervall: "Intervall (I)",
  terskel: "Terskel (T)",
  repetisjoner: "Repetisjoner (R)",
  maratonfart: "Maratonfart (M)",
  konkurranse: "Konkurranse",
};
