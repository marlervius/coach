import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Plan } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const plan: Plan | undefined = body?.plan;
  if (!plan || !Array.isArray(plan.weeks)) {
    return NextResponse.json({ error: "Ugyldig plan" }, { status: 400 });
  }
  try {
    await prisma.program.update({ where: { id }, data: { planJson: JSON.stringify(plan) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.program.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
  }
}
