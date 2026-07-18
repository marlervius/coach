/**
 * Jack Daniels' løpsformler (Daniels' Running Formula).
 *
 * Kjernen er sammenhengen mellom løpshastighet og oksygenopptak:
 *   VO2 = -4.60 + 0.182258·v + 0.000104·v²   (v i meter/minutt)
 *
 * Treningsintensiteter uttrykkes som prosent av VDOT (%VO2max):
 *   E (rolig)        62–74 %
 *   M (maratonfart)  80–86 %
 *   T (terskel)      86–89 %
 *   I (intervall)    95–100 %
 *   R (repetisjoner) 105–110 %
 */

/** Hastighet (m/min) som krever et gitt oksygenopptak. */
export function velocityAtVO2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Fart i sekunder per km ved en gitt prosent av VDOT. */
export function paceSecPerKm(vdot: number, pctVO2: number): number {
  return (1000 / velocityAtVO2(vdot * pctVO2)) * 60;
}

/** Formatterer sekunder som m:ss. */
export function fmtTime(totalSec: number): string {
  const sec = Math.round(totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Formatterer en varighet som h:mm:ss, eller m:ss under én time. */
export function fmtDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h === 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Fart for en gitt delstrekning, f.eks. per 400 m. */
export function fmtSplit(secPerKm: number, meters: number): string {
  return fmtTime((secPerKm * meters) / 1000);
}

export interface PaceRange {
  /** Raskeste fart i sonen, sek/km */
  fast: number;
  /** Roligste fart i sonen, sek/km */
  slow: number;
}

export interface TrainingPaces {
  E: PaceRange;
  M: PaceRange;
  T: PaceRange;
  I: PaceRange;
  R: PaceRange;
}

/** Beregner alle treningsfarter fra VDOT. */
export function trainingPaces(vdot: number): TrainingPaces {
  const range = (pctLow: number, pctHigh: number): PaceRange => ({
    fast: paceSecPerKm(vdot, pctHigh),
    slow: paceSecPerKm(vdot, pctLow),
  });
  return {
    E: range(0.62, 0.74),
    M: range(0.8, 0.86),
    T: range(0.86, 0.89),
    I: range(0.95, 1.0),
    R: range(1.05, 1.1),
  };
}

/** "5:10–5:45/km" */
export function fmtRange(r: PaceRange): string {
  return `${fmtTime(r.fast)}–${fmtTime(r.slow)}/km`;
}

/** Midtpunktet i en sone, sek/km. */
export function mid(r: PaceRange): number {
  return (r.fast + r.slow) / 2;
}

/** Pulssoner (prosent av makspuls) for hver intensitet. */
export const HR_ZONES: Record<string, { pct: [number, number] | null; label: string }> = {
  E: { pct: [65, 79], label: "Sone 1–2" },
  M: { pct: [80, 88], label: "Sone 3" },
  T: { pct: [88, 92], label: "Sone 4" },
  I: { pct: [92, 100], label: "Sone 5" },
  R: { pct: null, label: "Styres av fart, ikke puls" },
};

/** "65–79 % av makspuls (127–154 slag/min)" */
export function fmtHr(zone: keyof typeof HR_ZONES, hrMax?: number | null): string {
  const z = HR_ZONES[zone];
  if (!z.pct) return z.label;
  const [lo, hi] = z.pct;
  const base = `${lo}–${hi} % av makspuls`;
  if (!hrMax) return base;
  return `${base} (${Math.round((lo / 100) * hrMax)}–${Math.round((hi / 100) * hrMax)} slag/min)`;
}

/** Estimert konkurransefart (sek/km) for en distanse, gitt VDOT. */
export function racePaceSecPerKm(vdot: number, distanceKey: string): number {
  // Typisk %VO2max en trent løper klarer å holde over distansens varighet
  const pct: Record<string, number> = {
    "3000": 0.99,
    "5000": 0.955,
    "10000": 0.92,
    halvmaraton: 0.865,
    maraton: 0.82,
  };
  return paceSecPerKm(vdot, pct[distanceKey] ?? 0.9);
}

export const DISTANCES: Record<string, { label: string; km: number }> = {
  "3000": { label: "3000 m", km: 3 },
  "5000": { label: "5 km", km: 5 },
  "10000": { label: "10 km", km: 10 },
  halvmaraton: { label: "Halvmaraton", km: 21.0975 },
  maraton: { label: "Maraton", km: 42.195 },
};
