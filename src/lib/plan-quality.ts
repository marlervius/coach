import type { Plan, ProgramInput } from "./types";
import {
  inferRunningType,
  QUALITY_TYPES,
  RUNNING_TYPES,
  TYPE_TO_PACE_KEY,
} from "./training-type";
import { DISTANCES, fmtTime } from "./vdot";

export type PlanQualitySeverity = "error" | "warning" | "info";

export interface PlanQualityIssue {
  code: string;
  severity: PlanQualitySeverity;
  title: string;
  desc: string;
  weekNr?: number;
  date?: string;
}

export interface PlanQualityReport {
  score: number;
  ready: boolean;
  issues: PlanQualityIssue[];
}

export interface PlanQualityContext {
  daysPerWeek: number;
  weeklyKm: number;
  targetRace: string;
  goalTimeSec?: number | null;
  experienceLevel?: ProgramInput["experienceLevel"];
}

function thresholdWorkKm(title: string): number | null {
  const match = title.match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*km/i);
  if (!match) return null;
  return Number(match[1]) * Number(match[2].replace(",", "."));
}

export function auditPlan(plan: Plan, context: PlanQualityContext): PlanQualityReport {
  const issues: PlanQualityIssue[] = [];
  const paceByKey = new Map(plan.paces.map((pace) => [pace.key, pace]));
  const easyPace = paceByKey.get("E")?.range;
  const experienceLevel = context.experienceLevel ?? "mosjonist";

  for (const week of plan.weeks) {
    const qualityDays = week.days.filter((day) =>
      QUALITY_TYPES.has(day.type) || (day.type === "langtur" && day.desc.includes("harddag"))
    );
    const qualityLimit =
      experienceLevel === "ny" || context.daysPerWeek <= 3 || week.km < 30 ? 1 : 2;
    const isRaceWeek = week.days.some((day) => day.type === "konkurranse");

    if (!isRaceWeek && qualityDays.length > qualityLimit) {
      issues.push({
        code: "too-many-quality-days",
        severity: "error",
        weekNr: week.nr,
        title: `For mange harddager i uke ${week.nr}`,
        desc: `${qualityDays.length} kvalitetsdager overskrider anbefalt grense på ${qualityLimit} for denne belastningen.`,
      });
    }

    const sortedQuality = [...qualityDays].sort((a, b) => a.dow - b.dow);
    for (let index = 1; index < sortedQuality.length; index++) {
      if (sortedQuality[index].dow - sortedQuality[index - 1].dow < 2) {
        issues.push({
          code: "quality-spacing",
          severity: "error",
          weekNr: week.nr,
          date: sortedQuality[index].date,
          title: `Hardøktene ligger for tett i uke ${week.nr}`,
          desc: "Legg minst én hel rolig dag eller hviledag mellom tydelige kvalitetsøkter.",
        });
      }
    }

    const longRun = week.days.find((day) => day.type === "langtur");
    if (longRun && week.km > 0 && longRun.km / week.km > 0.42) {
      issues.push({
        code: "long-run-share",
        severity: "warning",
        weekNr: week.nr,
        date: longRun.date,
        title: `Langturen dominerer uke ${week.nr}`,
        desc: `${longRun.km} km utgjør ${Math.round((longRun.km / week.km) * 100)} % av uka. Vurder mer totalvolum eller en kortere langtur.`,
      });
    }

    for (const day of week.days) {
      if (!RUNNING_TYPES.has(day.type)) continue;
      const inferred = inferRunningType(day.title, day.desc);
      if (inferred && inferred !== day.type) {
        issues.push({
          code: "type-content-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Økttype og innhold er ulike ${day.date}`,
          desc: `Teksten beskriver «${inferred}», men fargekoden er «${day.type}».`,
        });
      }

      const expectedKey = TYPE_TO_PACE_KEY[day.type];
      if (expectedKey && expectedKey !== "E" && easyPace && day.pace === easyPace) {
        const expected = paceByKey.get(expectedKey);
        issues.push({
          code: "pace-type-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Feil fartssone ${day.date}`,
          desc: `${day.title} viser rolig fart. Velg økttypen på nytt for å sette ${expected?.range ?? expectedKey}.`,
        });
      }

      if (day.type === "terskel") {
        const workKm = thresholdWorkKm(day.title);
        const safeWorkKm = Math.max(6, week.km * 0.18);
        if (workKm != null && workKm > safeWorkKm) {
          issues.push({
            code: "threshold-dose",
            severity: "warning",
            weekNr: week.nr,
            date: day.date,
            title: `Stor terskeldose i uke ${week.nr}`,
            desc: `${workKm} km terskelarbeid er mye i en uke på ${week.km} km. Reduser draglengden eller løp økta i konkurransefart.`,
          });
        }
      }
    }
  }

  for (let index = 1; index < plan.weeks.length; index++) {
    const week = plan.weeks[index];
    if (week.phase === 4 || week.phaseName.includes("restitusjonsuke")) continue;
    const history = plan.weeks
      .slice(Math.max(0, index - 3), index)
      .filter((candidate) => !candidate.phaseName.includes("restitusjonsuke"));
    const baseline = Math.max(...history.map((candidate) => candidate.km), context.weeklyKm);
    if (week.km >= baseline + 3 && week.km > baseline * 1.15) {
      issues.push({
        code: "volume-spike",
        severity: "warning",
        weekNr: week.nr,
        title: `Brå volumøkning i uke ${week.nr}`,
        desc: `${week.km} km er ${Math.round(((week.km / baseline) - 1) * 100)} % over nylig belastning på ${baseline} km.`,
      });
    }
  }

  const raceWeek = plan.weeks.find((week) =>
    week.days.some((day) => day.type === "konkurranse")
  );
  if (raceWeek) {
    const preRaceRuns = raceWeek.days.filter(
      (day) => day.type !== "hvile" && day.type !== "konkurranse"
    );
    const expectedRuns = Math.max(2, context.daysPerWeek - 1);
    if (preRaceRuns.length < expectedRuns) {
      issues.push({
        code: "race-week-frequency",
        severity: "warning",
        weekNr: raceWeek.nr,
        title: "For lite løping i konkurranseuka",
        desc: `${preRaceRuns.length} økter før løpet kan gjøre beina flate. Behold omtrent ${expectedRuns} korte økter og reduser heller varigheten.`,
      });
    }

    if (context.goalTimeSec) {
      const race = raceWeek.days.find((day) => day.type === "konkurranse");
      const distance = DISTANCES[context.targetRace]?.km;
      if (race && distance) {
        const goalPace = context.goalTimeSec / distance;
        if (race.pace !== `${fmtTime(goalPace)}/km`) {
          issues.push({
            code: "goal-pace-mismatch",
            severity: "error",
            weekNr: raceWeek.nr,
            date: race.date,
            title: "Måltid og konkurransefart er ulike",
            desc: `Måltiden krever ${fmtTime(goalPace)}/km, mens konkurransedagen viser ${race.pace ?? "ingen fart"}.`,
          });
        }
      }
    }
  }

  const deductions = issues.reduce((sum, issue) => {
    if (issue.severity === "error") return sum + 15;
    if (issue.severity === "warning") return sum + 7;
    return sum + 3;
  }, 0);
  const score = Math.max(0, 100 - deductions);
  return {
    score,
    ready: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
