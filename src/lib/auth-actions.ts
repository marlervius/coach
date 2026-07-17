"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createCoachSession,
  deleteCoachSession,
  getAuthConfigurationError,
  isValidCoachPassword,
} from "./auth";

export interface LoginState {
  error: string | null;
}

interface AttemptState {
  count: number;
  resetAt: number;
}

const globalForAttempts = globalThis as unknown as {
  coachLoginAttempts?: Map<string, AttemptState>;
};
const attempts = globalForAttempts.coachLoginAttempts ?? new Map<string, AttemptState>();
if (process.env.NODE_ENV !== "production") globalForAttempts.coachLoginAttempts = attempts;

function attemptKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function registerAttempt(key: string, success: boolean): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (success) {
    attempts.delete(key);
    return true;
  }
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 8;
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const configurationError = getAuthConfigurationError();
  if (configurationError) return { error: configurationError };

  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = attemptKey(ip);
  const current = attempts.get(key);
  if (current && current.resetAt > Date.now() && current.count >= 8) {
    return { error: "For mange innloggingsforsøk. Prøv igjen om litt." };
  }

  const password = String(formData.get("password") ?? "");
  if (!isValidCoachPassword(password)) {
    registerAttempt(key, false);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { error: "Feil passord." };
  }

  registerAttempt(key, true);
  await createCoachSession();
  redirect("/coach");
}

export async function logout(): Promise<void> {
  await deleteCoachSession();
  redirect("/login");
}
