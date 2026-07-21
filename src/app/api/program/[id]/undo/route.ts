import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Plan } from "@/lib/types";
import { isCoachAuthenticated } from "@/lib/auth";
import { readJsonBody, RequestBodyError } from "@/lib/request";
import { parseRevision, ValidationError } from "@/lib/validation";

/** Angrer siste AI-endring ved å gjenopprette planen slik den var før AI-kjøringen. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCoachAuthenticated())) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }
  const { id } = await params;

  let revision: number;
  try {
    const body = await readJsonBody(req, 1_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Ugyldig forespørsel");
    }
    revision = parseRevision((body as Record<string, unknown>).revision);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const program = await prisma.program.findUnique({
    where: { id },
    select: { previousPlanJson: true },
  });
  if (!program) {
    return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
  }
  if (!program.previousPlanJson) {
    return NextResponse.json({ error: "Det finnes ingen AI-endring å angre." }, { status: 400 });
  }

  let restoredPlan: Plan;
  try {
    restoredPlan = JSON.parse(program.previousPlanJson) as Plan;
  } catch (error) {
    console.error("Lagret angreversjon har ugyldig JSON:", error);
    return NextResponse.json({ error: "Angreversjonen har ugyldige lagrede data." }, { status: 500 });
  }

  const result = await prisma.program.updateMany({
    where: { id, revision },
    data: {
      planJson: program.previousPlanJson,
      previousPlanJson: null,
      revision: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const latest = await prisma.program.findUnique({
      where: { id },
      select: { planJson: true, revision: true },
    });
    if (!latest) return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
    return NextResponse.json(
      {
        error: "Programmet er endret et annet sted. Siste versjon er lastet inn.",
        plan: JSON.parse(latest.planJson) as Plan,
        revision: latest.revision,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ plan: restoredPlan, revision: revision + 1 });
}
