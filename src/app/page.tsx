import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-5xl mb-4">🏃</p>
      <h1 className="text-4xl font-bold tracking-tight mb-3">LøpeCoach</h1>
      <p className="text-slate-500 max-w-md mb-8">
        Skreddersydde treningsprogrammer basert på VDOT og Jack Daniels&apos; treningsprinsipper.
        Dag for dag, uke for uke – med fart, pulssoner og alt som hører med.
      </p>
      <Link
        href="/coach"
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
      >
        Gå til coach-panelet
      </Link>
    </main>
  );
}
