import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJsonBody, RequestBodyError } from "@/lib/request";
import type { Plan } from "@/lib/types";
import {
  isCompletableWorkout,
  parseWorkoutCompletionUpdate,
  WorkoutCompletionValidationError,
} from "@/lib/workout-completion";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length > 200) {
      return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
    }

    const update = parseWorkoutCompletionUpdate(
      await readJsonBody(req, 1_000)
    );
    const program = await prisma.program.findUnique({
      where: { slug },
      select: { id: true, planJson: true },
    });
    if (!program) {
      return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
    }

    let plan: Plan;
    try {
      plan = JSON.parse(program.planJson) as Plan;
    } catch (error) {
      console.error("Offentlig program har ugyldig JSON:", error);
      return NextResponse.json(
        { error: "Programmet har ugyldige lagrede data" },
        { status: 500 }
      );
    }

    if (!isCompletableWorkout(plan, update.date)) {
      return NextResponse.json(
        { error: "Datoen tilhører ikke en gjennomførbar økt i programmet" },
        { status: 400 }
      );
    }

    if (update.completed) {
      await prisma.workoutCompletion.upsert({
        where: {
          programId_workoutDate: {
            programId: program.id,
            workoutDate: update.date,
          },
        },
        create: {
          programId: program.id,
          workoutDate: update.date,
        },
        update: {},
      });
    } else {
      await prisma.workoutCompletion.deleteMany({
        where: {
          programId: program.id,
          workoutDate: update.date,
        },
      });
    }

    return NextResponse.json(update, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof WorkoutCompletionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Lagring av øktstatus feilet:", error);
    return NextResponse.json(
      { error: "Kunne ikke lagre øktstatusen" },
      { status: 500 }
    );
  }
}
