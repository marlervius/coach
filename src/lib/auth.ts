import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "lopecoach_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface SessionPayload {
  role: "coach";
  exp: number;
}

function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createToken(payload: SessionPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function verifyToken(token: string, secret: string): boolean {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra || !safeEqual(signature, sign(encodedPayload, secret))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    return payload.role === "coach" && Number.isFinite(payload.exp) && payload.exp! > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function getAuthConfigurationError(): string | null {
  if (!process.env.COACH_PASSWORD || process.env.COACH_PASSWORD.length < 12) {
    return "COACH_PASSWORD må være satt og ha minst 12 tegn.";
  }
  if (!authSecret()) {
    return "AUTH_SECRET må være satt og ha minst 32 tegn.";
  }
  return null;
}

export function isValidCoachPassword(password: string): boolean {
  const configuredPassword = process.env.COACH_PASSWORD;
  return Boolean(configuredPassword && configuredPassword.length >= 12 && safeEqual(password, configuredPassword));
}

export async function createCoachSession(): Promise<void> {
  const secret = authSecret();
  if (!secret) throw new Error("Autentisering er ikke konfigurert");

  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = createToken(
    { role: "coach", exp: Math.floor(expires.getTime() / 1000) },
    secret
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function deleteCoachSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function isCoachAuthenticated(): Promise<boolean> {
  const secret = authSecret();
  if (!secret) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(token && verifyToken(token, secret));
}

export async function requireCoach(): Promise<void> {
  if (!(await isCoachAuthenticated())) redirect("/login");
}
