/**
 * Programgenerator basert på Jack Daniels' fire treningsfaser:
 *   Fase 1: Grunntrening (aerob base, stigningsløp)
 *   Fase 2: Tidlig kvalitet (R-økter for fart og løpsøkonomi, + terskel)
 *   Fase 3: Toppfase (I-økter / distansespesifikk hovedtrening)
 *   Fase 4: Nedtrapping og konkurransespesifikk trening
 *
 * Volum trappes gradvis opp mot en topp i fase 3, med restitusjonsuke
 * hver fjerde uke, og trappes ned mot konkurransen i fase 4.
 */
import {
  DISTANCES,
  fmtHr,
  fmtRange,
  fmtSplit,
  fmtTime,
  mid,
  racePaceSecPerKm,
  trainingPaces,
  type TrainingPaces,
} from "./vdot";
import type { Plan, PlanDay, PlanWeek, ProgramInput, PaceCard, DayType } from "./types";

function round05(n: number): number {
  return Math.round(n * 2) / 2;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fordeler ukene på de fire fasene. */
function phaseSplit(weeks: number): [number, number, number, number] {
  if (weeks <= 2) return [0, 0, weeks, 0];
  if (weeks === 3) return [0, 1, 1, 1];
  if (weeks <= 5) return [1, 1, weeks - 3, 1];
  const p1 = Math.round(weeks * 0.25);
  const p2 = Math.round(weeks * 0.25);
  const p4 = Math.max(1, Math.round(weeks * 0.15));
  return [p1, p2, weeks - p1 - p2 - p4, p4];
}

const PHASE_NAMES: Record<number, string> = {
  1: "Grunntrening",
  2: "Tidlig kvalitet",
  3: "Toppfase",
  4: "Nedtrapping",
};

function phaseFocus(phase: number, dist: string): string {
  const longDist = dist === "halvmaraton" || dist === "maraton";
  switch (phase) {
    case 1:
      return "Bygge aerob base og løpsøkonomi. Rolige turer og stigningsløp.";
    case 2:
      return "Fart og løpsteknikk med korte, raske drag (R-fart) pluss terskeltrening.";
    case 3:
      return longDist
        ? "Distansespesifikk utholdenhet: terskel- og maratonfartsøkter, lange turer."
        : "Maksimal aerob utvikling med harde intervaller i I-fart.";
    case 4:
      return "Redusert volum, konkurransespesifikk fart. Møt startstreken uthvilt og skarp.";
    default:
      return "";
  }
}

interface Session {
  type: DayType;
  title: string;
  desc: string;
  km: number;
  paceKey: "E" | "M" | "T" | "I" | "R";
}

const WU = "Oppvarming: 15 min rolig jogg + 4 stigningsløp.";
const CD = "Nedjogging: 10–15 min svært rolig.";

/** Kvalitetsøkt for gitt fase, distanse og plass i uka (1 eller 2). */
function qualitySession(
  phase: number,
  dist: string,
  slot: 1 | 2,
  weekKm: number,
  p: TrainingPaces,
  vdot: number
): Session {
  const big = weekKm >= 65;
  const medium = weekKm >= 40;
  const t = (m: number) => fmtSplit(mid(p.T), m);
  const i = (m: number) => fmtSplit(mid(p.I), m);
  const r = (m: number) => fmtSplit(mid(p.R), m);
  const m = (mm: number) => fmtSplit(mid(p.M), mm);
  const longDist = dist === "halvmaraton" || dist === "maraton";

  if (phase === 2 && slot === 1) {
    const reps = big ? 12 : medium ? 10 : 8;
    return {
      type: "repetisjoner",
      title: `${reps} × 200 m repetisjoner`,
      desc: `${WU} ${reps} × 200 m i R-fart (${r(200)} per 200 m) med 200 m gange/jogg som pause. Full kontroll på teknikken – dragene skal kjennes raske, men aldri anstrengte. ${CD}`,
      km: round05(4 + (reps * 0.4)),
      paceKey: "R",
    };
  }
  if (phase === 2 && slot === 2) {
    const min = big ? 3 : medium ? 3 : 2;
    return {
      type: "terskel",
      title: `${min} × 8 min terskel`,
      desc: `${WU} ${min} × 8 min i T-fart (${fmtRange(p.T)}, ca. ${t(1000)} per km) med 2 min rolig jogg mellom. Terskelfart skal kjennes "behagelig hard" – du skal kunne holde den i ca. 60 min i konkurranse. ${CD}`,
      km: round05(4 + min * 2.2),
      paceKey: "T",
    };
  }
  if (phase === 3 && slot === 1) {
    if (dist === "maraton") {
      const km = big ? 12 : medium ? 10 : 8;
      return {
        type: "maratonfart",
        title: `${km} km i maratonfart`,
        desc: `${WU} ${km} km sammenhengende i M-fart (${m(1000)} per km). Øv på drikke og næring underveis. ${CD}`,
        km: round05(4 + km),
        paceKey: "M",
      };
    }
    if (dist === "halvmaraton") {
      const reps = big ? 4 : 3;
      return {
        type: "terskel",
        title: `${reps} × 3 km terskel`,
        desc: `${WU} ${reps} × 3 km i T-fart (${t(1000)} per km) med 3 min jogg mellom. Jevn fart – ikke start for hardt. ${CD}`,
        km: round05(4 + reps * 3.5),
        paceKey: "T",
      };
    }
    const reps = big ? 6 : medium ? 5 : 4;
    return {
      type: "intervall",
      title: `${reps} × 1000 m intervall`,
      desc: `${WU} ${reps} × 1000 m i I-fart (${i(1000)} per 1000 m) med 3 min rolig jogg mellom dragene. Dette er ukas hardeste økt – I-fart tilsvarer ca. 3000–5000 m-fart. ${CD}`,
      km: round05(4 + reps * 1.8),
      paceKey: "I",
    };
  }
  if (phase === 3 && slot === 2) {
    if (longDist) {
      const min = big ? 40 : medium ? 30 : 25;
      return {
        type: "terskel",
        title: `Terskeløkt ${min} min`,
        desc: `${WU} ${min} min i vekslende T/M-fart: 10 min T (${t(1000)}/km), 10 min M (${m(1000)}/km), gjenta. ${CD}`,
        km: round05(4 + min / 4.5),
        paceKey: "T",
      };
    }
    return {
      type: "terskel",
      title: "20 min sammenhengende terskel",
      desc: `${WU} 20 min sammenhengende i T-fart (${fmtRange(p.T)}). Hold jevn rytme hele veien. ${CD}`,
      km: round05(4 + 4.5),
      paceKey: "T",
    };
  }
  // Fase 4: konkurransespesifikt
  if (slot === 1) {
    const rp = fmtTime(racePaceSecPerKm(vdot, dist));
    if (dist === "maraton")
      return {
        type: "maratonfart",
        title: "8 km i maratonfart",
        desc: `${WU} 8 km kontrollert i M-fart (${rp} per km). Siste finpuss – skal kjennes lett. ${CD}`,
        km: 12,
        paceKey: "M",
      };
    if (dist === "halvmaraton")
      return {
        type: "terskel",
        title: "2 × 15 min i konkurransefart",
        desc: `${WU} 2 × 15 min i planlagt konkurransefart (${rp} per km) med 3 min jogg mellom. ${CD}`,
        km: 11,
        paceKey: "T",
      };
    const reps = dist === "10000" ? 4 : 5;
    return {
      type: "intervall",
      title: `${reps} × 800 m i konkurransefart`,
      desc: `${WU} ${reps} × 800 m i planlagt konkurransefart (${rp} per km) med 2 min jogg mellom. Fokus på rytme og avslappet fart. ${CD}`,
      km: round05(4 + reps * 1.4),
      paceKey: "I",
    };
  }
  return {
    type: "repetisjoner",
    title: "Lett fartslek – 6 × 200 m",
    desc: `${WU} 6 × 200 m i R-fart (${r(200)} per 200 m) med god pause. Kort og lett – bare for å holde beina skarpe. ${CD}`,
    km: 7,
    paceKey: "R",
  };
}

/** Maks lengde på langtur per distanse. */
function longRunCap(dist: string): number {
  switch (dist) {
    case "3000": return 14;
    case "5000": return 16;
    case "10000": return 20;
    case "halvmaraton": return 26;
    default: return 32;
  }
}

/** Hvilke ukedager som brukes, gitt antall treningsdager. Q1/Q2/L = kvalitet og langtur. */
function weekLayout(daysPerWeek: number): Record<number, "E" | "Q1" | "Q2" | "L"> {
  switch (Math.min(7, Math.max(3, daysPerWeek))) {
    case 3: return { 1: "Q1", 3: "Q2", 5: "L" };
    case 4: return { 1: "Q1", 3: "Q2", 5: "L", 6: "E" };
    case 5: return { 1: "Q1", 2: "E", 3: "Q2", 5: "L", 6: "E" };
    case 6: return { 0: "E", 1: "Q1", 2: "E", 3: "Q2", 5: "L", 6: "E" };
    default: return { 0: "E", 1: "Q1", 2: "E", 3: "Q2", 4: "E", 5: "L", 6: "E" };
  }
}

export function generatePlan(input: ProgramInput): Plan {
  const { vdot, weeks, daysPerWeek, weeklyKm, hrMax, startDate, targetRace } = input;
  const p = trainingPaces(vdot);
  const [n1, n2, n3, n4] = phaseSplit(weeks);
  const peakFactor = targetRace === "maraton" ? 1.35 : 1.3;
  const peakKm = weeklyKm * peakFactor;
  const rampWeeks = Math.max(1, n1 + n2);
  const layout = weekLayout(daysPerWeek);
  const distLabel = DISTANCES[targetRace]?.label ?? targetRace;
  const racePace = racePaceSecPerKm(vdot, targetRace);

  const paceCards: PaceCard[] = [
    { key: "E", label: "E – Rolig", range: fmtRange(p.E), hr: fmtHr("E", hrMax), desc: "Rolige turer og langturer. Skal kjennes lett – du skal kunne prate." },
    { key: "M", label: "M – Maratonfart", range: fmtRange(p.M), hr: fmtHr("M", hrMax), desc: "Kontrollert hardt. Fart du kan holde i et maraton." },
    { key: "T", label: "T – Terskel", range: fmtRange(p.T), hr: fmtHr("T", hrMax), desc: "«Behagelig hardt». Ca. den farten du kan holde i 60 minutter." },
    { key: "I", label: "I – Intervall", range: fmtRange(p.I), hr: fmtHr("I", hrMax), desc: "Hardt – ca. 3000–5000 m-fart. Maksimerer det aerobe systemet." },
    { key: "R", label: "R – Repetisjoner", range: fmtRange(p.R), hr: fmtHr("R", hrMax), desc: "Korte, raske drag med full pause. Fart og løpsøkonomi." },
  ];

  const weeksOut: PlanWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const phase: 1 | 2 | 3 | 4 = w < n1 ? 1 : w < n1 + n2 ? 2 : w < n1 + n2 + n3 ? 3 : 4;
    const isRaceWeek = w === weeks - 1;
    const weeksFromEnd = weeks - 1 - w;

    // Ukevolum
    let km: number;
    if (phase === 4 || weeksFromEnd < n4) {
      km = isRaceWeek ? peakKm * 0.55 : peakKm * (weeksFromEnd === 1 ? 0.7 : 0.8);
    } else if (phase === 3) {
      km = peakKm;
    } else {
      km = weeklyKm + (peakKm - weeklyKm) * (w / rampWeeks);
    }
    // Restitusjonsuke hver 4. uke (ikke i nedtrappingen)
    const isRecovery = phase !== 4 && !isRaceWeek && (w + 1) % 4 === 0;
    if (isRecovery) km *= 0.78;

    // Bygg dagene
    const days: PlanDay[] = [];
    let plannedKm = 0;
    const sessions: Partial<Record<number, Session>> = {};
    const eDays: number[] = [];
    let longDay = -1;

    for (let dow = 0; dow < 7; dow++) {
      const role = layout[dow];
      if (!role) continue;
      if (role === "L") longDay = dow;
      else if (role === "E") eDays.push(dow);
      else if (phase === 1) {
        // I grunntreningsfasen erstattes kvalitetsøkter med rolige turer + stigningsløp
        eDays.push(dow);
      } else if (isRecovery && role === "Q1") {
        eDays.push(dow); // lettere restitusjonsuke: kun én kvalitetsøkt
      } else {
        sessions[dow] = qualitySession(phase, targetRace, role === "Q1" ? 1 : 2, km, p, vdot);
      }
    }

    const longKm = Math.min(round05(km * (targetRace === "maraton" ? 0.3 : 0.25)), longRunCap(targetRace));
    const sessionKm = Object.values(sessions).reduce((s, x) => s + (x?.km ?? 0), 0);
    const remaining = Math.max(0, km - longKm - sessionKm);
    const ePerDay = eDays.length ? round05(remaining / eDays.length) : 0;

    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(startDate, w * 7 + dow);
      const role = layout[dow];

      // Konkurransedag: siste dag i siste uke
      if (isRaceWeek && dow === 6) {
        days.push({
          dow, date, type: "konkurranse",
          title: `KONKURRANSE – ${distLabel}`,
          desc: `Dagen er her! Planlagt konkurransefart: ${fmtTime(racePace)} per km. Grundig oppvarming 20–30 min med noen stigningsløp. Start kontrollert, jevn fart, og gi alt på slutten. Lykke til!`,
          km: round05(DISTANCES[targetRace]?.km ?? 10),
          pace: `${fmtTime(racePace)}/km`,
          hr: "Konkurranseinnsats",
        });
        plannedKm += DISTANCES[targetRace]?.km ?? 10;
        continue;
      }
      if (isRaceWeek && dow === 5) {
        days.push({
          dow, date, type: "rolig",
          title: "Lett jogg + stigningsløp",
          desc: `20 min svært rolig jogg + 4 korte stigningsløp. Kort og lett dagen før konkurranse – bare for å holde kroppen i gang.`,
          km: 4,
          pace: fmtRange(p.E),
          hr: fmtHr("E", hrMax),
        });
        plannedKm += 4;
        continue;
      }

      if (!role) {
        days.push({ dow, date, type: "hvile", title: "Hvile", desc: "Full hviledag. Restitusjon er der kroppen bygger seg sterkere.", km: 0 });
        continue;
      }
      if (dow === longDay) {
        const extra =
          targetRace === "maraton" && phase === 3
            ? ` Avslutt med siste ${Math.round(longKm * 0.25)} km i M-fart (${fmtSplit(mid(p.M), 1000)}/km).`
            : "";
        days.push({
          dow, date, type: "langtur",
          title: `Langtur ${longKm} km`,
          desc: `${longKm} km rolig langtur i E-fart (${fmtRange(p.E)}). Jevn, avslappet fart – bygger utholdenhet og robusthet.${extra}`,
          km: longKm,
          pace: fmtRange(p.E),
          hr: fmtHr("E", hrMax),
        });
        plannedKm += longKm;
        continue;
      }
      const session = sessions[dow];
      if (session) {
        days.push({
          dow, date, type: session.type,
          title: session.title,
          desc: session.desc,
          km: session.km,
          pace: fmtRange(p[session.paceKey]),
          hr: fmtHr(session.paceKey, hrMax),
        });
        plannedKm += session.km;
        continue;
      }
      // Rolig dag
      const strides = phase === 1 && (dow === 1 || dow === 3);
      days.push({
        dow, date, type: "rolig",
        title: `Rolig ${ePerDay} km${strides ? " + stigningsløp" : ""}`,
        desc: `${ePerDay} km rolig i E-fart (${fmtRange(p.E)}).${strides ? " Avslutt med 6 × 20 sek stigningsløp med god pause – lett akselerasjon opp mot rask, kontrollert fart." : " Fokus på god løpsteknikk og avslappet rytme."}`,
        km: ePerDay,
        pace: fmtRange(p.E),
        hr: fmtHr("E", hrMax),
      });
      plannedKm += ePerDay;
    }

    weeksOut.push({
      nr: w + 1,
      phase,
      phaseName: PHASE_NAMES[phase] + (isRecovery ? " (restitusjonsuke)" : isRaceWeek ? " – konkurranseuke" : ""),
      focus: isRaceWeek
        ? `Konkurranseuke! Lite volum, mye hvile. Alt handler om å være pigg på ${distLabel.toLowerCase()}-dagen.`
        : isRecovery
          ? "Restitusjonsuke med redusert volum. La kroppen absorbere treningen."
          : phaseFocus(phase, targetRace),
      km: round05(plannedKm),
      days,
    });
  }

  return { paces: paceCards, weeks: weeksOut };
}
