import Link from "next/link";
import { createProgram } from "@/lib/actions";
import { DISTANCES } from "@/lib/vdot";
import { addIsoDays, isoDayOfWeek, todayInTimeZone } from "@/lib/date";
import { requireCoach } from "@/lib/auth";

function nextMonday(): string {
  const today = todayInTimeZone();
  const day = isoDayOfWeek(today); // 0 = søndag
  const diff = ((8 - day) % 7) || 7;
  return addIsoDays(today, diff);
}

const field =
  "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
const label = "block text-sm font-medium text-slate-700 mb-1";

export const dynamic = "force-dynamic";

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCoach();
  const { error } = await searchParams;

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">
        ← Tilbake
      </Link>
      <h1 className="text-3xl font-bold tracking-tight mt-2 mb-1">Nytt treningsprogram</h1>
      <p className="text-slate-500 mb-8">
        Individuell intensitetsstyring, trygg progresjon og konkurransespesifikk periodisering
        inspirert av Daniels, Lydiard og Canova. Du kan redigere alle økter etterpå.
      </p>

      <form action={createProgram} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div>
          <label className={label} htmlFor="athleteName">Utøverens navn</label>
          <input className={field} id="athleteName" name="athleteName" required placeholder="F.eks. Ingrid Hansen" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="targetRace">Konkurransedistanse</label>
            <select className={field} id="targetRace" name="targetRace" defaultValue="5000">
              {Object.entries(DISTANCES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="vdot">VDOT</label>
            <input className={field} id="vdot" name="vdot" type="number" step="0.1" min="20" max="85" required placeholder="F.eks. 50" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="weeks">Antall uker</label>
            <input className={field} id="weeks" name="weeks" type="number" min="2" max="30" defaultValue={12} required />
          </div>
          <div>
            <label className={label} htmlFor="daysPerWeek">Økter per uke</label>
            <select className={field} id="daysPerWeek" name="daysPerWeek" defaultValue="5">
              {[3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="weeklyKm">Ukesvolum nå (km)</label>
            <input className={field} id="weeklyKm" name="weeklyKm" type="number" min="10" max="200" defaultValue={40} required />
            <p className="text-xs text-slate-400 mt-1">Minst ca. 3 km per valgt økt</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="startDate">Startdato</label>
            <input className={field} id="startDate" name="startDate" type="date" defaultValue={nextMonday()} required />
            <p className="text-xs text-slate-400 mt-1">Bør være en mandag</p>
          </div>
          <div>
            <label className={label} htmlFor="hrMax">Makspuls (valgfritt)</label>
            <input className={field} id="hrMax" name="hrMax" type="number" min="120" max="230" placeholder="F.eks. 195" />
            <p className="text-xs text-slate-400 mt-1">Gir pulssoner i slag/min</p>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="notes">Notater (valgfritt)</label>
          <textarea className={field} id="notes" name="notes" rows={2} placeholder="F.eks. skadehistorikk, tilgang til bane, osv." />
          <p className="text-xs text-slate-400 mt-1">
            Brukes som coachkontekst ved AI-tilpasning; gjennomgå alltid planen ved skade eller sykdom.
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Generer program
        </button>
      </form>
    </main>
  );
}
