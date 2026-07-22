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

function round05(value: number): number {
  return Math.round(value * 2) / 2;
}

function ceil05(value: number): number {
  return Math.ceil(value * 2 - 1e-9) / 2;
}

function polishNorwegianText(text: string): string {
  return text
    .replace(/\bwith\b/gi, "med")
    .replace(/\bThis\b/g, "Dette")
    .replace(/\bthis\b/g, "dette")
    .replace(
      /\b(korrigert|justert|endret|redusert|økt)\s+to(?=\s+\d)/gi,
      "$1 til"
    )
    .replace(/\bBruk dagen to å(?=\s|[.,!?]|$)/g, "Bruk dagen til å")
    .replace(/\bbruk dagen to å(?=\s|[.,!?]|$)/g, "bruk dagen til å")
    .replace(/\bro to å(?=\s|[.,!?]|$)/gi, "ro til å");
}

function normalizeWeekTextAndTotal(
  week: Plan["weeks"][number]
): Plan["weeks"][number] {
  const days = week.days.map((day) => ({
    ...day,
    title: polishNorwegianText(day.title),
    desc: polishNorwegianText(day.desc),
  }));
  return {
    ...week,
    phaseName: polishNorwegianText(week.phaseName),
    focus: polishNorwegianText(week.focus),
    km: round05(days.reduce((sum, day) => sum + day.km, 0)),
    days,
  };
}

function balanceLongRunShare(
  week: Plan["weeks"][number],
  context: PlanQualityContext,
  easyPace?: string,
  easyHr?: string
): Plan["weeks"][number] {
  if (
    context.daysPerWeek <= 3 ||
    week.days.some((day) => day.type === "konkurranse")
  ) {
    return week;
  }

  const longRuns = week.days.filter(
    (day) => day.type === "langtur" && day.km > 0
  );
  if (longRuns.length !== 1 || week.km <= 0) return week;

  const longRun = longRuns[0];
  if (longRun.km / week.km <= 0.42) return week;

  const easyDates = week.days
    .filter((day) => day.type === "rolig" && day.km > 0)
    .map((day) => day.date);
  if (easyDates.length === 0) return week;

  const targetWeekKm = ceil05(longRun.km / 0.4);
  let halfKmSteps = Math.max(0, Math.round((targetWeekKm - week.km) * 2));
  const additions = new Map(easyDates.map((date) => [date, 0]));
  let cursor = 0;
  while (halfKmSteps > 0) {
    const date = easyDates[cursor % easyDates.length];
    additions.set(date, (additions.get(date) ?? 0) + 0.5);
    halfKmSteps--;
    cursor++;
  }

  const days = week.days.map((day) => {
    const addition = additions.get(day.date) ?? 0;
    if (addition === 0) return day;
    return makeEasy(
      { ...day, km: round05(day.km + addition) },
      false,
      easyPace,
      easyHr
    );
  });

  return {
    ...week,
    km: round05(days.reduce((sum, day) => sum + day.km, 0)),
    days,
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
  const structurallyStableWeeks = plan.weeks.map((week) => {
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

  const weeks = structurallyStableWeeks.map((week) => {
    const normalized = normalizeWeekTextAndTotal(week);
    return balanceLongRunShare(
      normalized,
      context,
      easyCard?.range,
      easyCard?.hr
    );
  });

  return { ...plan, weeks };
}
