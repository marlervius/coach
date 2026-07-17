import Link from "next/link";
import { prisma } from "@/lib/db";
import { DISTANCES } from "@/lib/vdot";
import { requireCoach } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  await requireCoach();
  const programs = await prisma.program.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <main className="max-w-4xl mx-auto w-full px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coach-panel</h1>
          <p className="text-slate-500 mt-1">Dine utøvere og treningsprogrammer</p>
        </div>
        <Link
          href="/coach/new"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          + Nytt program
        </Link>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <p className="text-lg font-medium mb-2">Ingen programmer ennå</p>
          <p>Opprett ditt første treningsprogram for en utøver.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {programs.map((p) => (
            <li key={p.id}>
              <Link
                href={`/coach/program/${p.id}`}
                className="block bg-white border border-slate-200 hover:border-emerald-400 rounded-xl p-5 transition-colors"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-lg">{p.athleteName}</p>
                    <p className="text-slate-500 text-sm">
                      {DISTANCES[p.targetRace]?.label ?? p.targetRace} · {p.weeks} uker ·{" "}
                      {p.daysPerWeek} økter/uke · VDOT {p.vdot}
                    </p>
                  </div>
                  <div className="text-sm text-slate-400">
                    Start {p.startDate.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
