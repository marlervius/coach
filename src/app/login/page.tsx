import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isCoachAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isCoachAuthenticated()) redirect("/coach");

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-4xl text-center mb-3" aria-hidden="true">🏃</p>
        <h1 className="text-3xl font-bold tracking-tight text-center mb-2">LøpeCoach</h1>
        <p className="text-slate-500 text-center mb-7">Logg inn for å administrere treningsprogrammer.</p>
        <LoginForm />
      </div>
    </main>
  );
}
