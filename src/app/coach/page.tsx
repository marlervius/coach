import Link from "next/link";
import { prisma } from "@/lib/db";
import { DISTANCES } from "@/lib/vdot";
import { requireCoach } from "@/lib/auth";
import { DeleteProgramButton } from "@/components/DeleteProgramButton";
import { countCompletableWorkouts } from "@/lib/workout-completion";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

function completableCount(planJson: string): number {
  try {
    return countCompletableWorkouts(JSON.parse(planJson) as Plan);
  } catch {
    return 0;
  }
}

export default async function CoachPage() {
  await requireCoach();
  const programs = await prisma.program.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { workoutCompletions: true } } },
  });

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
          {programs.map((p) => {
            const total = completableCount(p.planJson);
            const completed = Math.min(p._count.workoutCompletions, total);
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <li key={p.id} className="flex items-stretch gap-2">
                <Link
                  href={`/coach/program/${p.id}`}
                  className="flex-1 min-w-0 block bg-white border border-slate-200 hover:border-emerald-400 rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold text-lg">{p.athleteName}</p>
                      <p className="text-slate-500 text-sm">
                        {DISTANCES[p.targetRace]?.label ?? p.targetRace} · {p.weeks} uker ·{" "}
                        {p.daysPerWeek} økter/uke · VDOT {p.vdot}
                      </p>
                    </div>
                    <div className="text-sm text-slate-400 text-right">
                      <p>
                        Start{" "}
                        {p.startDate.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {total > 0 && (
                        <p className="mt-1 text-emerald-700 font-medium">
                          {completed} av {total} økter gjennomført
                        </p>
                      )}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </Link>
                <DeleteProgramButton id={p.id} athleteName={p.athleteName} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
