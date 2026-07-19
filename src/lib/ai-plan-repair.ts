import type { Plan, PlanDay } from "./types";
import type { PlanQualityContext } from "./plan-quality";
import { QUALITY_TYPES, RUNNING_TYPES } from "./training-type";

function isRecoveryWeek(phaseName: string): boolean {
  return phaseName.toLocaleLowerCase("nb-NO").includes("restitusjonsuke");
}

function qualityLimit(
  weekKm: number,
  phaseName: string,
  context: PlanQualityContext
): number {
  const experienceLevel = context.experienceLevel ?? "mosjonist";
  return isRecoveryWeek(phaseName) ||
    experienceLevel === "ny" ||
    context.daysPerWeek <= 3 ||
    weekKm < 30
    ? 1
    : 2;
}

function hasQualityContent(day: PlanDay): boolean {
  if (QUALITY_TYPES.has(day.type)) return true;
  if (day.type !== "langtur") return false;
  return /\b(harddag|progressiv|terskel|t-fart|maratonfart|m-fart|intervall|i-fart|konkurransefart)\b/i
    .test(`${day.title} ${day.desc}`);
}

function makeEasy(
  day: PlanDay,
  keepAsLongRun: boolean,
  easyPace?: string,
  easyHr?: string
): PlanDay {
  const type = keepAsLongRun ? "langtur" : "rolig";
  const title = `${keepAsLongRun ? "Langtur" : "Rolig"} ${day.km} km`;
  const paceText = easyPace ? ` i E-fart (${easyPace})` : " i rolig pratefart";
  const purpose = keepAsLongRun
    ? "Bygg aerob utholdenhet med jevn, kontrollert innsats og avslutt med overskudd."
    : "Hold belastningen lav slik at kroppen absorberer kvalitetsøktene og er klar til neste nøkkeløkt.";
  return {
    ...day,
    type,
    title,
    desc: `${day.km} km${paceText}, RPE 2–3/10. ${purpose}`,
    pace: easyPace,
    hr: easyHr,
  };
}

/**
 * Gjør de ukentlige strukturreglene deterministiske etter AI-redigering.
 * Gemini avgjør fortsatt øktinnholdet, mens serveren garanterer at en vanlig
 * uke beholder én langtur og ikke får flere harddager enn utøveren tåler.
 */
export function stabilizeAiPlan(
  plan: Plan,
  baseline: Plan,
  context: PlanQualityContext
): Plan {
  const easyCard = plan.paces.find((pace) => pace.key === "E");
  const baselineWeeks = new Map(baseline.weeks.map((week) => [week.nr, week]));
  const weeks = plan.weeks.map((week) => {
    if (week.days.some((day) => day.type === "konkurranse")) return week;

    let days = week.days.map((day) => ({ ...day }));
    const preferredLongRunDate = baselineWeeks
      .get(week.nr)
      ?.days.find((day) => day.type === "langtur" && day.km > 0)?.date;
    let longRuns = days.filter((day) => day.type === "langtur" && day.km > 0);

    if (longRuns.length === 0) {
      const runningDays = days.filter(
        (day) => RUNNING_TYPES.has(day.type) && day.km > 0
      );
      const candidate =
        runningDays.find((day) => day.date === preferredLongRunDate) ??
        [...runningDays]
          .filter((day) => !QUALITY_TYPES.has(day.type))
          .sort((a, b) => b.km - a.km)[0] ??
        [...runningDays].sort((a, b) => b.km - a.km)[0];
      if (candidate) {
        days = days.map((day) =>
          day.date === candidate.date
            ? makeEasy(day, true, easyCard?.range, easyCard?.hr)
            : day
        );
      }
      longRuns = days.filter((day) => day.type === "langtur" && day.km > 0);
    }

    if (longRuns.length > 1) {
      const keeper =
        longRuns.find((day) => day.date === preferredLongRunDate) ??
        [...longRuns].sort((a, b) => b.km - a.km)[0];
      days = days.map((day) =>
        day.type === "langtur" && day.km > 0 && day.date !== keeper.date
          ? makeEasy(day, false, easyCard?.range, easyCard?.hr)
          : day
      );
    }

    const maxQualityDays = qualityLimit(week.km, week.phaseName, context);
    const qualityDays = days
      .filter(hasQualityContent)
      .sort((a, b) => {
        const aLong = a.type === "langtur" ? 1 : 0;
        const bLong = b.type === "langtur" ? 1 : 0;
        return aLong - bLong || a.dow - b.dow;
      });
    const keepQualityDates = new Set(
      qualityDays.slice(0, maxQualityDays).map((day) => day.date)
    );
    if (qualityDays.length > maxQualityDays) {
      days = days.map((day) =>
        hasQualityContent(day) && !keepQualityDates.has(day.date)
          ? makeEasy(day, day.type === "langtur", easyCard?.range, easyCard?.hr)
          : day
      );
    }

    return { ...week, days };
  });

  return { ...plan, weeks };
}
