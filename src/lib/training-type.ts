import type { DayType } from "./types";

export const RUNNING_TYPES: ReadonlySet<DayType> = new Set([
  "rolig",
  "langtur",
  "intervall",
  "terskel",
  "repetisjoner",
  "maratonfart",
]);

export const QUALITY_TYPES: ReadonlySet<DayType> = new Set([
  "intervall",
  "terskel",
  "repetisjoner",
  "maratonfart",
]);

export const TYPE_TO_PACE_KEY: Partial<Record<DayType, string>> = {
  rolig: "E",
  langtur: "E",
  maratonfart: "M",
  terskel: "T",
  intervall: "I",
  repetisjoner: "R",
};

/**
 * Klassifiserer øktinnhold konservativt. Tittelen bør sendes inn først, siden
 * beskrivelser av kvalitetsøkter også omtaler rolig oppvarming og nedjogg.
 */
export function inferRunningType(title: string, desc: string): DayType | undefined {
  const classify = (text: string, allowEasy: boolean): DayType | undefined => {
    if (/\b(langtur|langkjøring)\b/i.test(text)) return "langtur";
    if (/\b(terskel|t-fart)\b/i.test(text)) return "terskel";
    if (/\b(maratonfart|m-fart)\b/i.test(text)) return "maratonfart";
    if (/\b(repetisjoner?|r-fart)\b/i.test(text)) return "repetisjoner";
    if (/\b(intervaller?|intervalløkt|i-fart)\b/i.test(text)) return "intervall";
    if (allowEasy && /\b(rolig|restitusjonsløp|e-fart)\b/i.test(text)) return "rolig";
    return undefined;
  };

  return classify(title, true) ?? classify(desc, false);
}
