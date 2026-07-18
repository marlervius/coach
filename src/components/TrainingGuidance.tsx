import type { PlanGuidance } from "@/lib/types";

export function TrainingGuidance({ guidance }: { guidance?: PlanGuidance }) {
  if (!guidance) return null;

  return (
    <section className="bg-slate-900 text-white rounded-2xl p-6 mb-6">
      <p className="text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
        Slik bruker du planen
      </p>
      <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
        {guidance.methodology}
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        {guidance.principles.map((principle) => (
          <div key={principle.title} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="font-semibold text-sm">{principle.title}</h3>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">{principle.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
