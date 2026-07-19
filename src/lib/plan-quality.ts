import type { Plan, ProgramInput } from "./types";
import {
  inferRunningType,
  isRestDayContent,
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

function round05(value: number): number {
  return Math.round(value * 2) / 2;
}

function thresholdWorkKm(title: string): number | null {
  const match = title.match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*km/i);
  if (!match) return null;
  return Number(match[1]) * Number(match[2].replace(",", "."));
}

function isRecoveryWeek(phaseName: string): boolean {
  return phaseName.toLocaleLowerCase("nb-NO").includes("restitusjonsuke");
}

function languageArtifact(text: string): string | undefined {
  const english = text.match(
    /\b(this|that|with|and then|your|easy pace|recovery run|rest day|training week)\b/i
  )?.[0];
  if (english) return english;

  return text.match(
    /\b(?:korrigert|justert|endret|redusert|økt|dagen|ro)\s+to\b/i
  )?.[0];
}

function hasQualityContent(day: Plan["weeks"][number]["days"][number]): boolean {
  if (QUALITY_TYPES.has(day.type)) return true;
  if (day.type !== "langtur") return false;
  return /\b(harddag|progressiv|terskel|t-fart|maratonfart|m-fart|intervall|i-fart|konkurransefart)\b/i
    .test(`${day.title} ${day.desc}`);
}

function timeBasedWorkMinutes(title: string): number | null {
  const match = title.match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*min/i);
  if (!match) return null;
  return Number(match[1]) * Number(match[2].replace(",", "."));
}

function statedTotalKm(
  day: Plan["weeks"][number]["days"][number]
): number | null {
  const totalMatch = `${day.title} ${day.desc}`.match(
    /(\d+(?:[.,]\d+)?)\s*km\s+totalt\b/i
  );
  if (totalMatch) return Number(totalMatch[1].replace(",", "."));

  if (day.type !== "rolig" && day.type !== "langtur") return null;
  const titleMatch =
    day.title.match(
      /^(?:rolig(?:\s+langkjøring)?|langtur|restitusjonsløp)\D{0,20}?(\d+(?:[.,]\d+)?)\s*km\b/i
    ) ??
    day.title.match(
      /^(\d+(?:[.,]\d+)?)\s*km\s+(?:rolig|langtur|restitusjonsløp)\b/i
    );
  if (titleMatch) return Number(titleMatch[1].replace(",", "."));

  const descMatch = day.desc.match(/^(\d+(?:[.,]\d+)?)\s*km\s+(?:i|rolig|lett)\b/i);
  return descMatch ? Number(descMatch[1].replace(",", ".")) : null;
}

function declaredType(text: string): string | undefined {
  return text.match(
    /\b(?:endret|endre|byttet|bytt)\s+(?:økt)?type(?:n)?\s+(?:er\s+)?til\s+["'«]?(rolig|langtur|intervall|terskel|repetisjoner|maratonfart|hvile|konkurranse)/i
  )?.[1]?.toLocaleLowerCase("nb-NO");
}

export function auditPlan(plan: Plan, context: PlanQualityContext): PlanQualityReport {
  const issues: PlanQualityIssue[] = [];
  const paceByKey = new Map(plan.paces.map((pace) => [pace.key, pace]));
  const experienceLevel = context.experienceLevel ?? "mosjonist";

  for (const week of plan.weeks) {
    const calculatedWeekKm = round05(
      week.days.reduce((sum, day) => sum + day.km, 0)
    );
    if (calculatedWeekKm !== week.km) {
      issues.push({
        code: "week-total-mismatch",
        severity: "error",
        weekNr: week.nr,
        title: `Ukessummen er feil i uke ${week.nr}`,
        desc: `Ukeoverskriften viser ${week.km} km, mens øktene summerer seg til ${calculatedWeekKm} km.`,
      });
    }

    const weekLanguage = languageArtifact(`${week.phaseName} ${week.focus}`);
    if (weekLanguage) {
      issues.push({
        code: "language-artifact",
        severity: "warning",
        weekNr: week.nr,
        title: `Språkfeil i uke ${week.nr}`,
        desc: `Uketeksten inneholder «${weekLanguage}». Hele planen skal være tydelig og korrekt norsk.`,
      });
    }

    const recoveryWeek = isRecoveryWeek(week.phaseName);
    const qualityDays = week.days.filter(hasQualityContent);
    const qualityLimit =
      recoveryWeek || experienceLevel === "ny" || context.daysPerWeek <= 3 || week.km < 30
        ? 1
        : 2;
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

    const longRuns = week.days.filter((day) => day.type === "langtur" && day.km > 0);
    if (!isRaceWeek && longRuns.length !== 1) {
      issues.push({
        code: "long-run-count",
        severity: "error",
        weekNr: week.nr,
        title: `Feil antall langturer i uke ${week.nr}`,
        desc: `Uka har ${longRuns.length} økter merket langtur. En normal treningsuke skal ha nøyaktig én.`,
      });
    }

    const longRun = longRuns[0];
    const maxLongRunShare = context.daysPerWeek <= 3 ? 0.45 : 0.42;
    if (longRun && week.km > 0 && longRun.km / week.km > maxLongRunShare) {
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
      const dayLanguage = languageArtifact(`${day.title} ${day.desc}`);
      if (dayLanguage) {
        issues.push({
          code: "language-artifact",
          severity: "warning",
          weekNr: week.nr,
          date: day.date,
          title: `Språkfeil ${day.date}`,
          desc: `Øktteksten inneholder «${dayLanguage}». Skriv konsekvent og korrekt norsk.`,
        });
      }

      if (day.type === "hvile") {
        if (day.km !== 0 || day.pace || day.hr) {
          issues.push({
            code: "rest-fields-mismatch",
            severity: "error",
            weekNr: week.nr,
            date: day.date,
            title: `Hviledagen har treningsdata ${day.date}`,
            desc: "En hviledag skal ha 0 km og ingen fart- eller pulssone.",
          });
        }
        continue;
      }
      if (!RUNNING_TYPES.has(day.type)) continue;

      if (day.km <= 0 || isRestDayContent(day.title, day.desc)) {
        issues.push({
          code: "running-rest-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Løpedagen beskriver hvile ${day.date}`,
          desc:
            day.km <= 0
              ? `Økten er merket «${day.type}», men har ${day.km} km. Velg hvile eller legg inn faktisk løpsdistanse.`
              : `Økten er merket «${day.type}», men tittelen eller beskrivelsen sier at dette er en hviledag.`,
        });
      }

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

      const statedType = declaredType(`${day.title} ${day.desc}`);
      if (statedType && statedType !== day.type) {
        issues.push({
          code: "declared-type-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Teksten oppgir en annen økttype ${day.date}`,
          desc: `Teksten sier at typen er «${statedType}», mens fargekoden er «${day.type}».`,
        });
      }

      const textKm = statedTotalKm(day);
      if (textKm != null && Math.abs(textKm - day.km) > 0.25) {
        issues.push({
          code: "distance-text-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Distansefelt og tekst er ulike ${day.date}`,
          desc: `Distansefeltet viser ${day.km} km, mens overskrift eller beskrivelse oppgir ${textKm} km totalt.`,
        });
      }

      const expectedKey = TYPE_TO_PACE_KEY[day.type];
      const expected = expectedKey ? paceByKey.get(expectedKey) : undefined;
      if (
        expected &&
        (day.pace !== expected.range || day.hr !== expected.hr)
      ) {
        issues.push({
          code: "pace-type-mismatch",
          severity: "error",
          weekNr: week.nr,
          date: day.date,
          title: `Feil fart eller pulssone ${day.date}`,
          desc: `${day.title} er merket «${day.type}» og skal vise ${expected.range} og ${expected.hr}.`,
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

      const workMinutes = timeBasedWorkMinutes(day.title);
      if (workMinutes != null && QUALITY_TYPES.has(day.type)) {
        const generousSessionKm = round05(5 + workMinutes / 3.5);
        if (day.km > generousSessionKm + 0.5) {
          issues.push({
            code: "session-distance",
            severity: "error",
            weekNr: week.nr,
            date: day.date,
            title: `Distanse og øktoppskrift stemmer ikke ${day.date}`,
            desc: `${day.title} er satt til ${day.km} km. Med oppvarming, pauser og nedjogg bør økta normalt ikke overstige omtrent ${generousSessionKm} km.`,
          });
        }
      }
    }
  }

  for (let index = 1; index < plan.weeks.length; index++) {
    const week = plan.weeks[index];
    if (isRecoveryWeek(week.phaseName)) {
      const previous = plan.weeks[index - 1];
      if (previous.km > 0 && week.km > previous.km * 0.9) {
        issues.push({
          code: "recovery-week-volume",
          severity: "error",
          weekNr: week.nr,
          title: `Restitusjonsuka reduserer ikke volumet`,
          desc: `Uke ${week.nr} er merket restitusjonsuke, men har ${week.km} km mot ${previous.km} km uka før. Reduser minst 10 %.`,
        });
      }
      continue;
    }
    if (week.phase === 4) continue;
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
      (day) => RUNNING_TYPES.has(day.type) && day.km > 0 && !isRestDayContent(day.title, day.desc)
    );
    const expectedRuns = Math.max(2, context.daysPerWeek - 1);
    if (preRaceRuns.length < expectedRuns) {
      issues.push({
        code: "race-week-frequency",
        severity: "error",
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
    ready: issues.length === 0,
    issues,
  };
}
