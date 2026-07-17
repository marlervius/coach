"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { generatePlan } from "./generator";
import type { ProgramInput } from "./types";

function makeSlug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createProgram(formData: FormData) {
  const input: ProgramInput = {
    athleteName: String(formData.get("athleteName") ?? "").trim(),
    targetRace: String(formData.get("targetRace") ?? "5000"),
    vdot: Number(formData.get("vdot")),
    weeks: Number(formData.get("weeks")),
    daysPerWeek: Number(formData.get("daysPerWeek")),
    weeklyKm: Number(formData.get("weeklyKm")),
    hrMax: formData.get("hrMax") ? Number(formData.get("hrMax")) : null,
    startDate: String(formData.get("startDate")),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };

  if (!input.athleteName || !input.vdot || !input.weeks || !input.startDate) {
    throw new Error("Mangler påkrevde felter");
  }

  const plan = generatePlan(input);

  const program = await prisma.program.create({
    data: {
      slug: makeSlug(),
      athleteName: input.athleteName,
      targetRace: input.targetRace,
      vdot: input.vdot,
      weeks: input.weeks,
      daysPerWeek: input.daysPerWeek,
      weeklyKm: input.weeklyKm,
      hrMax: input.hrMax,
      startDate: new Date(input.startDate + "T12:00:00Z"),
      notes: input.notes,
      planJson: JSON.stringify(plan),
    },
  });

  redirect(`/coach/program/${program.id}`);
}

export async function deleteProgram(id: string) {
  await prisma.program.delete({ where: { id } });
  revalidatePath("/coach");
  redirect("/coach");
}
