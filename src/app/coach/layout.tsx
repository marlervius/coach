import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import { requireCoach } from "@/lib/auth";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/coach" className="font-bold tracking-tight text-emerald-800">
            LøpeCoach
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-800">
              Logg ut
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
