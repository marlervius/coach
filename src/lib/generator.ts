/**
 * Programgenerator basert på et samspill mellom:
 *   - Jack Daniels: individualiserte VDOT-farter og tydelig øktformål
 *   - Arthur Lydiard: aerob kapasitet før høy spesifisitet
 *   - Renato Canova: gradvis mer konkurransespesifikk trening
 *   - moderne belastningsstyring: få tydelige harddager, restitusjonsuker og taper
 *
 * Planen bruker Daniels' fire treningsfaser:
 *   Fase 1: Grunntrening (aerob base, stigningsløp)
 *   Fase 2: Tidlig kvalitet (R-økter for fart og løpsøkonomi, + terskel)
 *   Fase 3: Toppfase (I-økter / distansespesifikk hovedtrening)
 *   Fase 4: Nedtrapping og konkurransespesifikk trening
 *
 * Volum trappes kontrollert opp mot en topp i fase 3, med restitusjonsuke
 * hver fjerde uke, og trappes ned mot konkurransen i fase 4. Kvalitetstetthet,
 * arbeidsmengde og langtur tilpasses faktisk treningsfrekvens og ukesvolum.
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
import { addIsoDays } from "./date";

function round05(n: number): number {
  return Math.round(n * 2) / 2;
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
      return "Bygg aerob kapasitet, robusthet og løpsøkonomi. Hold de rolige dagene virkelig rolige.";
    case 2:
      return "Utvikle løpsøkonomi og kontrollert terskel. Kvalitetsøktene skal avsluttes med overskudd.";
    case 3:
      return longDist
        ? "Gjør utholdenheten konkurransespesifikk med terskel, målrettet konkurransefart og lange turer."
        : "Utvikle konkurransespesifikk kapasitet med kontrollert I-fart, terskel og god restitusjon.";
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
  phaseWeek: number,
  weeksToRace: number,
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
    const useFourHundreds = phaseWeek % 2 === 1;
    const reps = useFourHundreds
      ? big ? 8 : medium ? 7 : 6
      : big ? 12 : medium ? 10 : 8;
    const meters = useFourHundreds ? 400 : 200;
    return {
      type: "repetisjoner",
      title: `${reps} × ${meters} m kontrollert fart`,
      desc: `${WU} ${reps} × ${meters} m i R-fart (${r(meters)} per drag) med ${meters === 200 ? "200 m" : "400 m"} svært rolig jogg. Løp avslappet med høy hofte og god rytme; stopp serien hvis teknikken faller. RPE 7/10. ${CD}`,
      km: round05(4 + reps * (meters / 500)),
      paceKey: "R",
    };
  }
  if (phase === 2 && slot === 2) {
    const variants = big
      ? [{ reps: 4, minutes: 7 }, { reps: 3, minutes: 10 }, { reps: 5, minutes: 6 }]
      : medium
        ? [{ reps: 3, minutes: 8 }, { reps: 4, minutes: 6 }, { reps: 3, minutes: 9 }]
        : [{ reps: 3, minutes: 6 }, { reps: 2, minutes: 10 }, { reps: 4, minutes: 5 }];
    const workout = variants[phaseWeek % variants.length];
    return {
      type: "terskel",
      title: `${workout.reps} × ${workout.minutes} min terskel`,
      desc: `${WU} ${workout.reps} × ${workout.minutes} min i T-fart (${fmtRange(p.T)}, ca. ${t(1000)} per km) med 90 sek rolig jogg. Finn flyten på første drag og hold samme innsats hele veien. RPE 7/10 – kontrollert, aldri maksimalt. ${CD}`,
      km: round05(4 + (workout.reps * workout.minutes) / 4.2),
      paceKey: "T",
    };
  }
  if (phase === 3 && slot === 1) {
    if (dist === "maraton") {
      const km = big ? 12 : medium ? 10 : 8;
      const cruise = phaseWeek % 2 === 1;
      return {
        type: "maratonfart",
        title: cruise ? `2 × ${km / 2} km i maratonfart` : `${km} km progressiv maratonøkt`,
        desc: cruise
          ? `${WU} 2 × ${km / 2} km i M-fart (${m(1000)} per km) med 1 km rolig flyt mellom. Øv på planlagt drikke og næring. RPE 6/10. ${CD}`
          : `${WU} ${km} km sammenhengende: start kontrollert i rolig ende av M-fart og jobb gradvis mot ${m(1000)} per km. Øv på planlagt drikke og næring; avslutt med overskudd. ${CD}`,
        km: round05(5 + km),
        paceKey: "M",
      };
    }
    if (dist === "halvmaraton") {
      const reps = big ? (phaseWeek % 2 ? 4 : 3) : 3;
      const repKm = big && reps === 3 ? 3 : 2;
      return {
        type: "terskel",
        title: `${reps} × ${repKm} km halvmaratonspesifikk terskel`,
        desc: `${WU} ${reps} × ${repKm} km rundt kontrollert T-fart (${t(1000)} per km) med 2 min rolig jogg. Jevn innsats og rask, lett rytme; siste drag skal ligne det første. ${CD}`,
        km: round05(4 + reps * (repKm + 0.35)),
        paceKey: "T",
      };
    }
    const intervalVariants = big
      ? [{ reps: 6, meters: 1000 }, { reps: 8, meters: 800 }, { reps: 5, meters: 1200 }]
      : medium
        ? [{ reps: 5, meters: 1000 }, { reps: 6, meters: 800 }, { reps: 4, meters: 1200 }]
        : [{ reps: 4, meters: 1000 }, { reps: 6, meters: 600 }, { reps: 5, meters: 800 }];
    const workout = intervalVariants[phaseWeek % intervalVariants.length];
    return {
      type: "intervall",
      title: `${workout.reps} × ${workout.meters} m aerob intervall`,
      desc: `${WU} ${workout.reps} × ${workout.meters} m i I-fart (${i(workout.meters)} per drag) med 2–3 min rolig jogg. Åpne kontrollert og løp alle drag jevnt; dette er ukas hardeste økt, men ikke en test. RPE 8/10. ${CD}`,
      km: round05(4 + workout.reps * (workout.meters / 1000 + 0.5)),
      paceKey: "I",
    };
  }
  if (phase === 3 && slot === 2) {
    if (longDist) {
      const min = big ? 40 : medium ? 30 : 25;
      return {
        type: "terskel",
        title: `Terskeløkt ${min} min`,
        desc: `${WU} ${min} min som 5 min i T-fart (${t(1000)}/km) / 5 min i M-fart (${m(1000)}/km). Flyt mellom intensitetene uten å jage fart. RPE 6–7/10. ${CD}`,
        km: round05(4 + min / 4.5),
        paceKey: "T",
      };
    }
    return {
      type: "terskel",
      title: "20 min sammenhengende terskel",
      desc: `${WU} 20 min sammenhengende i T-fart (${fmtRange(p.T)}). Hold jevn rytme og avslutt med følelsen av at du kunne fortsatt i fem minutter. RPE 7/10. ${CD}`,
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
        title: `${weeksToRace <= 1 ? 5 : 8} km i maratonfart`,
        desc: `${WU} ${weeksToRace <= 1 ? 5 : 8} km kontrollert i planlagt maratonfart (${rp} per km). Bekreft rytme, sko og ernæringsrutine; økta skal bygge trygghet, ikke form. ${CD}`,
        km: weeksToRace <= 1 ? 9 : 12,
        paceKey: "M",
      };
    if (dist === "halvmaraton")
      return {
        type: "terskel",
        title: weeksToRace <= 1 ? "3 × 5 min i konkurransefart" : "2 × 12 min i konkurransefart",
        desc: `${WU} ${weeksToRace <= 1 ? "3 × 5" : "2 × 12"} min i planlagt konkurransefart (${rp} per km) med 2 min rolig jogg. Avslappet og kontrollert – ingen sluttspurt. ${CD}`,
        km: weeksToRace <= 1 ? 8 : 10,
        paceKey: "T",
      };
    const reps = weeksToRace <= 1 ? 4 : dist === "10000" ? 5 : 6;
    return {
      type: "intervall",
      title: `${reps} × ${weeksToRace <= 1 ? 400 : 800} m i konkurransefart`,
      desc: `${WU} ${reps} × ${weeksToRace <= 1 ? 400 : 800} m i planlagt konkurransefart (${rp} per km) med 90 sek rolig jogg. Fokus på rytme og avslappet fart; stopp mens beina fortsatt føles kvikke. ${CD}`,
      km: round05(4 + reps * (weeksToRace <= 1 ? 0.7 : 1.25)),
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

/** Kort kvalitetsøkt som holder totaldistansen innenfor ukebudsjettet. */
function compactQualitySession(
  phase: number,
  dist: string,
  maxKm: number,
  p: TrainingPaces,
  vdot: number
): Session {
  const km = Math.max(3, round05(maxKm));
  if (phase === 2) {
    return {
      type: "repetisjoner",
      title: `${km} km rolig + stigningsløp`,
      desc: `${km} km totalt i E-fart (${fmtRange(p.E)}). Etter rolig oppvarming: 6 × 20 sek kontrollerte stigningsløp med full gå-/joggepause. Dette gir fart og god teknikk uten å sprenge ukesvolumet.`,
      km,
      paceKey: "E",
    };
  }
  if (phase === 3 && (dist === "halvmaraton" || dist === "maraton")) {
    return {
      type: "terskel",
      title: `Kontrollert terskelfartslek – ${km} km totalt`,
      desc: `${km} km totalt. Løp rolig i E-fart og legg inn 4 × 3 min i T-fart (${fmtRange(p.T)}) med 2 min rolig jogg. Avslutt rolig. Hold god kontroll hele veien.`,
      km,
      paceKey: "T",
    };
  }
  if (phase === 3) {
    return {
      type: "intervall",
      title: `Kort intervalløkt – ${km} km totalt`,
      desc: `${km} km totalt. Etter rolig oppvarming: 6 × 1 min i I-fart (${fmtRange(p.I)}) med 90 sek rolig jogg. Resten løpes lett. Korte drag gir kvalitet uten for stort volum.`,
      km,
      paceKey: "I",
    };
  }
  const racePace = fmtTime(racePaceSecPerKm(vdot, dist));
  return {
    type: "intervall",
    title: `Lett konkurransefart – ${km} km totalt`,
    desc: `${km} km totalt med 4 korte drag på 60–90 sek i planlagt konkurransefart (${racePace}/km). God pause og full kontroll – målet er å bli skarp, ikke sliten.`,
    km,
    paceKey: "I",
  };
}

/**
 * Langturens andel av ukesvolumet. Langturen skal alltid være ukas lengste
 * rolige økt, så andelen øker jo færre økter uka har å fordele volumet på.
 */
function longRunShare(daysPerWeek: number, dist: string): number {
  const base: Record<number, number> = { 3: 0.4, 4: 0.34, 5: 0.3, 6: 0.27, 7: 0.25 };
  const share = base[Math.min(7, Math.max(3, daysPerWeek))] ?? 0.3;
  if (dist === "maraton") return share + 0.04;
  if (dist === "halvmaraton") return share + 0.02;
  return share;
}

/**
 * Toppvolumet programmet bygger mot. Progresjonen er bevisst mer konservativ
 * enn den klassiske tiprosentregelen: høyere startvolum tåler mindre prosentvis
 * økning, og kortere distanser krever ikke maratonvolum.
 */
export function peakWeeklyKm(weeks: number, weeklyKm: number, targetRace: string): number {
  const [n1, n2] = phaseSplit(weeks);
  const rampWeeks = Math.max(1, n1 + n2);
  const rampRate = weeklyKm >= 80 ? 1.04 : weeklyKm >= 50 ? 1.05 : 1.07;
  const cap = targetRace === "maraton" ? 1.45 : targetRace === "halvmaraton" ? 1.4 : 1.35;
  return weeklyKm * Math.min(Math.pow(rampRate, rampWeeks), cap);
}

/** Antall tydelige kvalitetsdager som belastningen faktisk gir rom for. */
function qualityDayLimit(daysPerWeek: number, weekKm: number, isRecovery: boolean): 1 | 2 {
  if (isRecovery || daysPerWeek <= 3 || weekKm < 30) return 1;
  return 2;
}

function planGuidance(input: ProgramInput, p: TrainingPaces) {
  const { targetRace: dist, weeks, weeklyKm } = input;
  const longDistance = dist === "halvmaraton" || dist === "maraton";
  const needsCoachReview =
    (dist === "maraton" && (weeklyKm < 30 || weeks < 12)) ||
    (dist === "halvmaraton" && (weeklyKm < 20 || weeks < 8));
  return {
    methodology:
      "Planen kombinerer Daniels’ intensitetsstyring, Lydiards aerobe fundament og Canovas gradvise konkurransespesifisitet. Målet er kontinuitet: nok kvalitet til framgang, men aldri mer enn du kan absorbere.",
    principles: [
      ...(needsCoachReview
        ? [{
            title: "Coachvurdering kreves",
            desc: "Tiden eller startvolumet er lavt i forhold til konkurransemålet. Prioriter trygg gjennomføring framfor resultatmål, og vurder å forlenge oppbyggingen før planen tas i bruk.",
          }]
        : []),
      {
        title: "Styr etter innsats",
        desc: `Fartene er utgangspunkt, ikke tvang. På varme, vindfulle eller kuperte dager styrer du etter følelse og puls. Rolig betyr pratefart (${fmtRange(p.E)}, RPE 2–3/10).`,
      },
      {
        title: "Grønt, gult eller rødt lys",
        desc: "Grønt: normal økt. Gult: uvanlig tung kropp eller dårlig søvn – kutt kvalitetsdelen 20–30 %. Rødt: sykdom eller smerte som endrer steget – avbryt og hvil. Tapte økter tas aldri igjen.",
      },
      {
        title: "Restitusjon er trening",
        desc: "La det være minst 48 timer mellom harde løpeøkter. Prioriter søvn og rolig intensitet; god kontinuitet slår enkeltøkter.",
      },
      {
        title: longDistance ? "Drikke og energi" : "Oppvarming og styrke",
        desc: longDistance
          ? "På turer over 75 minutter øver du på samme drikke og karbohydratstrategi som i konkurransen. Test alt på trening, aldri for første gang på løpsdagen."
          : "Før kvalitetsøkter: 15 minutter rolig + dynamisk bevegelse og stigningsløp. Legg gjerne inn 2 × 20 minutter enkel styrke per uke etter rolige dager.",
      },
    ],
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

function longRunTimeCapMinutes(dist: string): number {
  if (dist === "maraton") return 180;
  if (dist === "halvmaraton") return 150;
  return 120;
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
  const peakKm = peakWeeklyKm(weeks, weeklyKm, targetRace);
  const layout = weekLayout(daysPerWeek);
  const distLabel = DISTANCES[targetRace]?.label ?? targetRace;
  const racePace = racePaceSecPerKm(vdot, targetRace);

  const paceCards: PaceCard[] = [
    { key: "E", label: "E – Rolig", range: fmtRange(p.E), hr: fmtHr("E", hrMax), desc: "Pratefart, RPE 2–3/10. Senk farten ved varme, bakker eller tung kropp." },
    { key: "M", label: "M – Maratonfart", range: fmtRange(p.M), hr: fmtHr("M", hrMax), desc: "Kontrollert og økonomisk, RPE 5–6/10. Brukes målrettet – ikke på rolige dager." },
    { key: "T", label: "T – Terskel", range: fmtRange(p.T), hr: fmtHr("T", hrMax), desc: "Kontrollert hardt, RPE 7/10. Du skal kunne fullføre ett drag til." },
    { key: "I", label: "I – Intervall", range: fmtRange(p.I), hr: fmtHr("I", hrMax), desc: "Hard aerob innsats, RPE 8/10. Jevne drag er viktigere enn raskest mulig fart." },
    { key: "R", label: "R – Repetisjoner", range: fmtRange(p.R), hr: fmtHr("R", hrMax), desc: "Raskt og avslappet med full pause. Stopp før teknikken eller farten faller." },
  ];

  const weeksOut: PlanWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const phase: 1 | 2 | 3 | 4 = w < n1 ? 1 : w < n1 + n2 ? 2 : w < n1 + n2 + n3 ? 3 : 4;
    const phaseStart = phase === 1 ? 0 : phase === 2 ? n1 : phase === 3 ? n1 + n2 : n1 + n2 + n3;
    const phaseWeek = w - phaseStart;
    const isRaceWeek = w === weeks - 1;
    const weeksFromEnd = weeks - 1 - w;

    // Ukevolum
    let km: number;
    if (phase === 4 || weeksFromEnd < n4) {
      km = isRaceWeek ? peakKm * 0.55 : peakKm * (weeksFromEnd === 1 ? 0.7 : 0.8);
    } else if (phase === 3) {
      km = peakKm;
    } else {
      // Jevn, individuell oppbygging fra nåværende belastning mot toppvolumet.
      const buildProgress = Math.min(1, w / Math.max(1, n1 + n2 - 1));
      km = weeklyKm + (peakKm - weeklyKm) * buildProgress;
    }
    if (isRaceWeek) {
      const raceKm = round05(DISTANCES[targetRace]?.km ?? 10);
      const preRaceKm = Math.max(8, Math.min(20, peakKm * 0.25));
      km = Math.max(km, raceKm + preRaceKm);
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
    const fastFinishLongRun =
      targetRace === "maraton" &&
      phase === 3 &&
      !isRecovery &&
      !isRaceWeek &&
      daysPerWeek >= 5 &&
      km >= 45 &&
      phaseWeek % 2 === 1;
    const qualityLimit =
      phase === 1
        ? 0
        : phase === 4 || isRaceWeek || fastFinishLongRun
          ? 1
          : qualityDayLimit(daysPerWeek, km, isRecovery);
    let qualityDays = 0;

    for (let dow = 0; dow < 7; dow++) {
      const role = layout[dow];
      if (!role) continue;
      if (isRaceWeek && (dow === 5 || dow === 6)) continue;
      if (role === "L") longDay = dow;
      else if (role === "E") eDays.push(dow);
      else if (phase === 1) {
        // I grunntreningsfasen erstattes kvalitetsøkter med rolige turer + stigningsløp
        eDays.push(dow);
      } else if (qualityDays >= qualityLimit) {
        eDays.push(dow);
      } else {
        sessions[dow] = isRecovery
          ? compactQualitySession(phase, targetRace, Math.min(8, km * 0.16), p, vdot)
          : qualitySession(
              isRaceWeek ? 4 : phase,
              targetRace,
              role === "Q1" ? 1 : 2,
              phaseWeek,
              weeksFromEnd,
              km,
              p,
              vdot
            );
        qualityDays++;
      }
    }

    const raceAndShakeoutKm = isRaceWeek
      ? round05(DISTANCES[targetRace]?.km ?? 10) + 4
      : 0;
    const availableKm = Math.max(0, km - raceAndShakeoutKm);
    const longKm = isRaceWeek
      ? 0
      : Math.min(
          round05(km * longRunShare(daysPerWeek, targetRace)),
          longRunCap(targetRace),
          Math.floor(
            ((longRunTimeCapMinutes(targetRace) * 60) / mid(p.E)) * 2
          ) / 2
        );
    const minimumEasyKm = 2.5;
    const sessionDays = () =>
      Object.keys(sessions)
        .map(Number)
        .sort((a, b) => a - b);
    const committedKm = () =>
      longKm +
      Object.values(sessions).reduce((sum, session) => sum + (session?.km ?? 0), 0) +
      eDays.length * minimumEasyKm;

    // Fjern den andre kvalitetsøkten først hvis den ikke får plass i ukebudsjettet.
    while (sessionDays().length > 1 && committedKm() > availableKm) {
      const day = sessionDays().at(-1)!;
      delete sessions[day];
      eDays.push(day);
    }

    // Skaler den gjenværende kvalitetsøkten, eller gjør den rolig, ved lavt volum.
    const remainingSessionDays = sessionDays();
    if (remainingSessionDays.length === 1 && committedKm() > availableKm) {
      const day = remainingSessionDays[0];
      const maxSessionKm = round05(
        availableKm - longKm - eDays.length * minimumEasyKm
      );
      if (maxSessionKm >= 3) {
        sessions[day] = compactQualitySession(phase, targetRace, maxSessionKm, p, vdot);
      } else {
        delete sessions[day];
        eDays.push(day);
      }
    }

    const sessionKm = Object.values(sessions).reduce((sum, session) => sum + (session?.km ?? 0), 0);
    const remaining = Math.max(0, availableKm - longKm - sessionKm);
    const easyKm = new Map<number, number>();
    const easyUnits = Math.floor(remaining * 2 + 1e-9);
    const baseUnits = eDays.length ? Math.floor(easyUnits / eDays.length) : 0;
    const extraUnits = eDays.length ? easyUnits % eDays.length : 0;
    // Roligturene skal alltid være kortere enn langturen
    const easyMaxKm =
      longKm > 0 ? Math.max(minimumEasyKm, longKm - 1) : Number.POSITIVE_INFINITY;
    [...eDays]
      .sort((a, b) => a - b)
      .forEach((day, index) => {
        easyKm.set(day, Math.min((baseUnits + (index < extraUnits ? 1 : 0)) / 2, easyMaxKm));
      });

    for (let dow = 0; dow < 7; dow++) {
      const date = addIsoDays(startDate, w * 7 + dow);
      const role = layout[dow];

      // Konkurransedag: siste dag i siste uke
      if (isRaceWeek && dow === 6) {
        const raceKm = round05(DISTANCES[targetRace]?.km ?? 10);
        const warmup =
          targetRace === "maraton"
            ? "10–15 min svært rolig bevegelse og 3 korte stigninger"
            : "15–20 min rolig jogg, dynamisk bevegelse og 4 stigningsløp";
        const execution =
          targetRace === "maraton" || targetRace === "halvmaraton"
            ? "Åpne de første 10 % kontrollert, finn planlagt rytme gjennom midtpartiet og konkurrer først i siste fjerdedel."
            : "Åpne kontrollert, lås deg til rytmen gjennom midtpartiet og øk gradvis når du har en fjerdedel igjen.";
        days.push({
          dow, date, type: "konkurranse",
          title: `KONKURRANSE – ${distLabel}`,
          desc: `Planlagt konkurransefart: ${fmtTime(racePace)} per km. Oppvarming: ${warmup}. ${execution} Bruk planen som anker, men styr etter forhold og dagsform.`,
          km: raceKm,
          pace: `${fmtTime(racePace)}/km`,
          hr: "Konkurranseinnsats",
        });
        plannedKm += raceKm;
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
          fastFinishLongRun
            ? ` Etter en rolig åpning løper du siste ${Math.max(3, Math.round(longKm * 0.2))} km kontrollert i M-fart (${fmtSplit(mid(p.M), 1000)}/km). Denne langturen teller som en harddag.`
            : "";
        days.push({
          dow, date, type: "langtur",
          title: `Langtur ${longKm} km`,
          desc: `${longKm} km i E-fart (${fmtRange(p.E)}, RPE 2–3/10). Løp jevnt og avslappet; på turer over 75 min øver du på drikke og energi.${extra}`,
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
      const dayKm = easyKm.get(dow) ?? 0;
      if (dayKm === 0) {
        days.push({
          dow,
          date,
          type: "hvile",
          title: "Hvile",
          desc: "Ingen løping i dag. Det lave ukesvolumet prioriteres på de viktigste øktene.",
          km: 0,
        });
        continue;
      }
      const strides = phase === 1 && (dow === 1 || dow === 3);
      days.push({
        dow, date, type: "rolig",
        title: `Rolig ${dayKm} km${strides ? " + stigningsløp" : ""}`,
        desc: `${dayKm} km i E-fart (${fmtRange(p.E)}, RPE 2–3/10).${strides ? " Avslutt med 6 × 20 sek stigningsløp med full gå-/joggepause – raskt og avslappet, aldri sprint." : " Hold igjen nok til at neste kvalitetsdag kan gjennomføres godt."}`,
        km: dayKm,
        pace: fmtRange(p.E),
        hr: fmtHr("E", hrMax),
      });
        plannedKm += dayKm;
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

  return { paces: paceCards, weeks: weeksOut, guidance: planGuidance(input, p) };
}
