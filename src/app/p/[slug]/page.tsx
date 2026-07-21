import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DISTANCES, fmtDuration } from "@/lib/vdot";
import { DAY_NAMES, TYPE_LABELS, type Plan, type DayType } from "@/lib/types";
import { daysBetween, todayInTimeZone } from "@/lib/date";
import { TrainingGuidance } from "@/components/TrainingGuidance";
import { WorkoutCompletionToggle } from "@/components/WorkoutCompletionToggle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const TYPE_STYLE: Record<DayType, { badge: string; border: string }> = {
  hvile: { badge: "bg-slate-100 text-slate-500", border: "border-slate-200" },
  rolig: { badge: "bg-emerald-100 text-emerald-800", border: "border-emerald-200" },
  langtur: { badge: "bg-sky-100 text-sky-800", border: "border-sky-200" },
  intervall: { badge: "bg-red-100 text-red-800", border: "border-red-300" },
  terskel: { badge: "bg-orange-100 text-orange-800", border: "border-orange-300" },
  repetisjoner: { badge: "bg-purple-100 text-purple-800", border: "border-purple-300" },
  maratonfart: { badge: "bg-amber-100 text-amber-800", border: "border-amber-300" },
  konkurranse: { badge: "bg-yellow-200 text-yellow-900", border: "border-yellow-400" },
};

export default async function AthletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = await prisma.program.findUnique({
    where: { slug },
    include: {
      workoutCompletions: {
        select: { workoutDate: true },
      },
    },
  });
  if (!program) notFound();

  const plan: Plan = JSON.parse(program.planJson);
  const completedDates = new Set(
    program.workoutCompletions.map((completion) => completion.workoutDate)
  );
  const today = todayInTimeZone();
  const allWorkouts = plan.weeks.flatMap((week) =>
    week.days.filter((day) => day.type !== "hvile" && day.km > 0)
  );
  const completedCount = allWorkouts.filter((day) => completedDates.has(day.date)).length;
  const dueWorkouts = allWorkouts.filter((day) => day.date <= today).length;
  const currentWeekIdx = plan.weeks.findIndex((w) =>
    w.days.some((d) => d.date >= today)
  );
  const distLabel = DISTANCES[program.targetRace]?.label ?? program.targetRace;
  const raceDate = plan.weeks.at(-1)?.days.at(-1)?.date;
  const daysToRace = raceDate
    ? Math.max(0, daysBetween(today, raceDate))
    : null;

  return (
    <main className="max-w-3xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <header className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white rounded-2xl p-8 mb-6">
        <p className="text-emerald-200 text-sm font-semibold uppercase tracking-wider mb-1">
          Treningsprogram
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{program.athleteName}</h1>
        <p className="text-emerald-100 mt-2">
          Mot {distLabel} · {program.weeks} uker · VDOT {program.vdot}
          {program.goalTimeSec ? ` · mål ${fmtDuration(program.goalTimeSec)}` : ""}
        </p>
        <div className="mt-4 flex gap-2 flex-wrap">
          {daysToRace !== null && daysToRace > 0 && (
            <p className="inline-block bg-white/15 rounded-full px-4 py-1.5 text-sm font-semibold">
              🏁 {daysToRace} dager til konkurransen
            </p>
          )}
          {dueWorkouts > 0 && (
            <p className="inline-block bg-white/15 rounded-full px-4 py-1.5 text-sm font-semibold">
              ✅ {completedCount} av {dueWorkouts} økter gjennomført så langt
            </p>
          )}
        </div>
      </header>

      {/* Treningsfarter */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">Dine treningsfarter</h2>
        <div className="grid gap-3">
          {plan.paces.map((p) => (
            <div key={p.key} className="flex gap-4 items-baseline flex-wrap">
              <span className="font-bold w-36 shrink-0">{p.label}</span>
              <span className="font-mono text-emerald-700 font-semibold">{p.range}</span>
              <span className="text-sm text-slate-500">{p.hr}</span>
              <span className="text-sm text-slate-400 basis-full sm:basis-auto sm:flex-1">{p.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <TrainingGuidance guidance={plan.guidance} />

      {/* Uker */}
      {plan.weeks.map((week, wi) => (
        <details
          key={week.nr}
          open={wi === (currentWeekIdx === -1 ? plan.weeks.length - 1 : currentWeekIdx)}
          className="bg-white border border-slate-200 rounded-2xl mb-4 overflow-hidden"
        >
          <summary className="cursor-pointer select-none px-6 py-4 hover:bg-slate-50 transition-colors">
            <div className="inline-flex flex-col sm:flex-row sm:items-baseline sm:gap-3 w-[calc(100%-1.5rem)] align-top">
              <span className="text-lg font-bold">Uke {week.nr}</span>
              <span className="text-slate-500 text-sm">
                {week.phaseName} · {week.km} km
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">{week.focus}</p>
          </summary>
          <div className="px-4 pb-4 grid gap-2">
            {week.days.map((day) => {
              const style = TYPE_STYLE[day.type] ?? TYPE_STYLE.rolig;
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className={`rounded-xl border ${style.border} ${
                    isToday ? "ring-2 ring-emerald-500 bg-emerald-50/40" : "bg-white"
                  } p-4 flex gap-4`}
                >
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-bold">{DAY_NAMES[day.dow]}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("nb-NO", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    {isToday && (
                      <p className="text-xs font-bold text-emerald-600 mt-1">I DAG</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
                        {TYPE_LABELS[day.type] ?? day.type}
                      </span>
                      <span className="font-semibold">{day.title}</span>
                      {day.km > 0 && <span className="text-sm text-slate-500">{day.km} km</span>}
                      {day.type !== "hvile" && day.km > 0 && day.date <= today && (
                        <WorkoutCompletionToggle
                          slug={slug}
                          date={day.date}
                          initialCompleted={completedDates.has(day.date)}
                        />
                      )}
                    </div>
                    {day.desc && <p className="text-sm text-slate-600 mt-1.5">{day.desc}</p>}
                    {(day.pace || day.hr) && (
                      <p className="text-xs text-slate-500 mt-1.5 font-medium">
                        {day.pace && <>⏱ {day.pace}</>}
                        {day.pace && day.hr && <span className="mx-1.5">·</span>}
                        {day.hr && <>❤️ {day.hr}</>}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}

      <footer className="text-center text-sm text-slate-400 py-8">
        Programmet er laget av din coach · individuelt dosert og periodisert
      </footer>
    </main>
  );
}
