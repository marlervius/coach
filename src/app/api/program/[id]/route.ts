import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Plan } from "@/lib/types";
import { isCoachAuthenticated } from "@/lib/auth";
import { readJsonBody, RequestBodyError } from "@/lib/request";
import {
  parseRevision,
  sanitizePlanUpdate,
  ValidationError,
} from "@/lib/validation";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCoachAuthenticated())) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Ugyldig forespørsel");
    }
    const { plan: candidate, revision: rawRevision } = body as Record<string, unknown>;
    const revision = parseRevision(rawRevision);
    const program = await prisma.program.findUnique({
      where: { id },
      select: { planJson: true, revision: true },
    });
    if (!program) return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });

    const currentPlan = JSON.parse(program.planJson) as Plan;
    const plan = sanitizePlanUpdate(candidate, currentPlan);
    const result = await prisma.program.updateMany({
      where: { id, revision },
      data: {
        planJson: JSON.stringify(plan),
        // Manuell redigering gjør AI-angrepunktet utdatert
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

    return NextResponse.json({ ok: true, plan, revision: revision + 1 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Lagring av program feilet:", error);
    return NextResponse.json({ error: "Kunne ikke lagre programmet" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCoachAuthenticated())) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }
  const { id } = await params;
  const result = await prisma.program.deleteMany({ where: { id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
