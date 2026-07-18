"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { generatePlan } from "./generator";
import { requireCoach } from "./auth";
import { parseProgramInput, ValidationError } from "./validation";

function makeSlug(): string {
  return randomBytes(16).toString("base64url");
}

export async function createProgram(formData: FormData) {
  await requireCoach();

  let input;
  try {
    input = parseProgramInput(formData);
  } catch (error) {
    if (error instanceof ValidationError) {
      redirect(`/coach/new?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const plan = generatePlan(input);

  const program = await prisma.program.create({
    data: {
      slug: makeSlug(),
      athleteName: input.athleteName,
      targetRace: input.targetRace,
      vdot: input.vdot,
      goalTimeSec: input.goalTimeSec,
      experienceLevel: input.experienceLevel ?? "mosjonist",
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
