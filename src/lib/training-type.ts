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

export function isRestDayContent(title: string, desc: string): boolean {
  const titleText = title.trim();
  const combined = `${titleText} ${desc}`;
  return (
    /^(hvile|fridag|treningsfri)(?:\b|$)/i.test(titleText) ||
    /\b(full hviledag|ingen løping(?: i dag)?|helt treningsfri)\b/i.test(combined)
  );
}

/**
 * Klassifiserer øktinnhold konservativt. Tittelen bør sendes inn først, siden
 * beskrivelser av kvalitetsøkter også omtaler rolig oppvarming og nedjogg.
 */
export function inferRunningType(title: string, desc: string): DayType | undefined {
  const classify = (text: string, allowEasy: boolean): DayType | undefined => {
    // «Langtur» er alltid hovedtypen, også når økta avsluttes progressivt
    // eller inneholder blokker i M-/T-fart. Belastningen telles separat.
    if (/\blangtur\b/i.test(text)) return "langtur";
    if (/\b(t\s*\/\s*m-fart|terskel\s*\/\s*maratonfart)\b/i.test(text)) return "terskel";
    if (/\b(terskel|t-fart)\b/i.test(text)) return "terskel";
    if (/\b(maratonfart|m-fart)\b/i.test(text)) return "maratonfart";
    if (/\b(repetisjoner?|r-fart)\b/i.test(text)) return "repetisjoner";
    if (/\b(intervaller?|intervalløkt|i-fart)\b/i.test(text)) return "intervall";
    if (
      allowEasy &&
      /\b(rolig(?:\s+langkjøring)?|restitusjonsløp|e-fart)\b/i.test(text)
    ) {
      return "rolig";
    }
    if (/\blangkjøring\b/i.test(text)) return "langtur";
    return undefined;
  };

  if (isRestDayContent(title, desc)) return "hvile";
  return classify(title, true) ?? classify(desc, false);
}
