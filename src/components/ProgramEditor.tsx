"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan, PlanDay, DayType } from "@/lib/types";
import { DAY_NAMES, TYPE_LABELS } from "@/lib/types";
import { DISTANCES } from "@/lib/vdot";

const TYPE_COLORS: Record<DayType, string> = {
  hvile: "bg-slate-100 text-slate-600",
  rolig: "bg-emerald-100 text-emerald-800",
  langtur: "bg-sky-100 text-sky-800",
  intervall: "bg-red-100 text-red-800",
  terskel: "bg-orange-100 text-orange-800",
  repetisjoner: "bg-purple-100 text-purple-800",
  maratonfart: "bg-amber-100 text-amber-800",
  konkurranse: "bg-yellow-200 text-yellow-900",
};

interface ProgramMeta {
  id: string;
  slug: string;
  athleteName: string;
  targetRace: string;
  vdot: number;
  weeks: number;
  daysPerWeek: number;
  weeklyKm: number;
  hrMax: number | null;
  startDate: string;
  notes: string | null;
  revision: number;
}

export function ProgramEditor({ program, initialPlan }: { program: ProgramMeta; initialPlan: Plan }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [editing, setEditing] = useState<string | null>(null); // "w-d"
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revision, setRevision] = useState(program.revision);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${program.slug}` : `/p/${program.slug}`;

  async function savePlan(next: Plan): Promise<boolean> {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/program/${program.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next, revision }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push("/login");
        return false;
      }
      if (res.status === 409 && data.plan) {
        setPlan(data.plan);
        setRevision(data.revision);
        setMessage(data.error);
        return false;
      }
      if (!res.ok) {
        setMessage(data.error ?? "Kunne ikke lagre – prøv igjen.");
        return false;
      }
      setPlan(data.plan ?? next);
      setRevision(data.revision);
      return true;
    } catch {
      setMessage("Kunne ikke lagre – prøv igjen.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateDay(wi: number, di: number, patch: Partial<PlanDay>) {
    const next: Plan = structuredClone(plan);
    Object.assign(next.weeks[wi].days[di], patch, { edited: true });
    next.weeks[wi].km = Math.round(next.weeks[wi].days.reduce((s, d) => s + (Number(d.km) || 0), 0) * 2) / 2;
    if (await savePlan(next)) setEditing(null);
  }

  async function runAI() {
    setAiRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/program/${program.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        if (data.plan) setPlan(data.plan);
        if (typeof data.revision === "number") setRevision(data.revision);
        setMessage(data.error ?? "AI-forbedring feilet.");
      } else {
        setPlan(data.plan);
        setRevision(data.revision);
        setMessage("Programmet er forbedret av AI. Se over endringene!");
      }
    } catch {
      setMessage("AI-forbedring feilet – sjekk tilkoblingen.");
    } finally {
      setAiRunning(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function remove() {
    if (!confirm(`Slette programmet til ${program.athleteName}? Dette kan ikke angres.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/program/${program.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "Kunne ikke slette programmet.");
        return;
      }
      router.push("/coach");
      router.refresh();
    } catch {
      setMessage("Kunne ikke slette programmet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      {/* Toppkort */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{program.athleteName}</h1>
            <p className="text-slate-500">
              {DISTANCES[program.targetRace]?.label ?? program.targetRace} · {program.weeks} uker ·{" "}
              {program.daysPerWeek} økter/uke · VDOT {program.vdot}
              {program.hrMax ? ` · makspuls ${program.hrMax}` : ""}
            </p>
            {program.notes && <p className="text-sm text-slate-400 mt-1">{program.notes}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={runAI}
              disabled={aiRunning || saving}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {aiRunning ? "AI jobber…" : "✨ Forbedre med AI"}
            </button>
            <button
              onClick={remove}
              disabled={saving || aiRunning}
              className="border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Slett
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">Utøverens lenke:</span>
          <a href={`/p/${program.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
            /p/{program.slug}
          </a>
          <button onClick={copyLink} className="text-sm text-slate-500 hover:text-slate-800 underline">
            {copied ? "Kopiert!" : "Kopier lenke"}
          </button>
          {saving && <span className="text-sm text-slate-400">Lagrer…</span>}
        </div>
        {message && <p className="mt-3 text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">{message}</p>}
      </div>

      {/* Uker */}
      {plan.weeks.map((week, wi) => (
        <section key={week.nr} className="mb-6">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-lg font-bold">
              Uke {week.nr}{" "}
              <span className="font-normal text-slate-500">
                · {week.phaseName} · {week.km} km
              </span>
            </h2>
            <span className="text-xs text-slate-400 hidden sm:block max-w-md text-right">{week.focus}</span>
          </div>
          <div className="grid gap-2">
            {week.days.map((day, di) => {
              const key = `${wi}-${di}`;
              return editing === key ? (
                <DayEditForm
                  key={key}
                  day={day}
                  onSave={(patch) => updateDay(wi, di, patch)}
                  onCancel={() => setEditing(null)}
                  disabled={saving}
                />
              ) : (
                <div key={key} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-4 items-start">
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-semibold">{DAY_NAMES[day.dow]}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[day.type] ?? "bg-slate-100"}`}>
                        {TYPE_LABELS[day.type] ?? day.type}
                      </span>
                      <span className="font-semibold">{day.title}</span>
                      {day.km > 0 && <span className="text-sm text-slate-500">{day.km} km</span>}
                      {day.edited && (
                        <span className="text-xs text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">endret manuelt</span>
                      )}
                    </div>
                    {day.desc && <p className="text-sm text-slate-600 mt-1">{day.desc}</p>}
                    {(day.pace || day.hr) && (
                      <p className="text-xs text-slate-400 mt-1">
                        {day.pace && <>Fart: {day.pace}</>}
                        {day.pace && day.hr && " · "}
                        {day.hr && <>Puls: {day.hr}</>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditing(key)}
                    disabled={saving || aiRunning}
                    className="text-sm text-slate-400 hover:text-emerald-700 disabled:opacity-40 shrink-0"
                  >
                    Rediger
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayEditForm({
  day,
  onSave,
  onCancel,
  disabled,
}: {
  day: PlanDay;
  onSave: (patch: Partial<PlanDay>) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [form, setForm] = useState({
    type: day.type,
    title: day.title,
    desc: day.desc,
    km: String(day.km),
    pace: day.pace ?? "",
    hr: day.hr ?? "",
  });
  const field = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="bg-emerald-50/50 border-2 border-emerald-300 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select disabled={disabled} className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DayType })}>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input disabled={disabled} className={field + " sm:col-span-2"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tittel" />
      </div>
      <textarea disabled={disabled} className={field} rows={3} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Beskrivelse av økten" />
      <div className="grid grid-cols-3 gap-3">
        <input disabled={disabled} className={field} type="number" step="0.5" min="0" max="300" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} placeholder="km" />
        <input disabled={disabled} className={field} value={form.pace} onChange={(e) => setForm({ ...form, pace: e.target.value })} placeholder="Fart, f.eks. 4:30–4:50/km" />
        <input disabled={disabled} className={field} value={form.hr} onChange={(e) => setForm({ ...form, hr: e.target.value })} placeholder="Pulssone" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void onSave({ ...form, km: Number(form.km) || 0 })}
          disabled={disabled}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Lagre
        </button>
        <button disabled={disabled} onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 px-3">
          Avbryt
        </button>
      </div>
    </div>
  );
}
