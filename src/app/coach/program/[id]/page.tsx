import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProgramEditor } from "@/components/ProgramEditor";
import type { Plan } from "@/lib/types";
import { requireCoach } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCoach();
  const { id } = await params;
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) notFound();

  const plan: Plan = JSON.parse(program.planJson);

  return (
    <main className="max-w-5xl mx-auto w-full px-4 py-8">
      <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">
        ← Alle programmer
      </Link>
      <ProgramEditor
        program={{
          id: program.id,
          slug: program.slug,
          athleteName: program.athleteName,
          targetRace: program.targetRace,
          vdot: program.vdot,
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          weeklyKm: program.weeklyKm,
          hrMax: program.hrMax,
          startDate: program.startDate.toISOString().slice(0, 10),
          notes: program.notes,
          revision: program.revision,
        }}
        initialPlan={plan}
      />
    </main>
  );
}
