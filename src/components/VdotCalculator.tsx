"use client";

import { useState } from "react";
import { DISTANCES, vdotFromRace } from "@/lib/vdot";

function parseRaceTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [hours, minutes, seconds] =
    match[3] !== undefined
      ? [Number(match[1]), Number(match[2]), Number(match[3])]
      : [0, Number(match[1]), Number(match[2])];
  if (minutes > 59 || seconds > 59) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/** Regner ut VDOT fra et løpsresultat og fyller inn i #vdot-feltet i skjemaet. */
export function VdotCalculator() {
  const [distance, setDistance] = useState("5000");
  const [time, setTime] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate() {
    setError(null);
    setResult(null);
    const seconds = parseRaceTime(time);
    if (seconds === null) {
      setError("Skriv tiden som mm:ss eller t:mm:ss, f.eks. 47:30 eller 1:45:00.");
      return;
    }
    const vdot = vdotFromRace(DISTANCES[distance].km, seconds);
    if (!Number.isFinite(vdot) || vdot < 20 || vdot > 85) {
      setError("Tiden gir en VDOT utenfor 20–85. Sjekk at distanse og tid stemmer.");
      return;
    }
    const rounded = Math.round(vdot * 10) / 10;
    setResult(rounded);
    const input = document.getElementById("vdot") as HTMLInputElement | null;
    if (input) input.value = String(rounded);
  }

  const field =
    "border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-600 mb-2">
        Vet du ikke VDOT? Regn ut fra et ferskt løpsresultat:
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <select
          aria-label="Distanse for løpsresultat"
          className={field}
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
        >
          {Object.entries(DISTANCES).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Tid for løpsresultat"
          className={`${field} w-28`}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="47:30"
          inputMode="numeric"
        />
        <button
          type="button"
          onClick={calculate}
          className="border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          Regn ut
        </button>
        {result !== null && (
          <span className="text-sm font-semibold text-emerald-700">
            VDOT {result} er fylt inn ✓
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
