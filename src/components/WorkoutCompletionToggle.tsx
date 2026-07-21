"use client";

import { useState } from "react";

interface WorkoutCompletionToggleProps {
  slug: string;
  date: string;
  initialCompleted: boolean;
}

export function WorkoutCompletionToggle({
  slug,
  date,
  initialCompleted,
}: WorkoutCompletionToggleProps) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function updateCompletion(nextCompleted: boolean) {
    const previous = completed;
    setCompleted(nextCompleted);
    setSaving(true);
    setError(undefined);

    try {
      const response = await fetch(
        `/api/public/program/${encodeURIComponent(slug)}/completion`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, completed: nextCompleted }),
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Kunne ikke lagre");
      }
    } catch (requestError) {
      setCompleted(previous);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Kunne ikke lagre"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="basis-full sm:basis-auto sm:ml-auto">
      <label
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
          completed
            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
            : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
        } ${saving ? "cursor-wait opacity-70" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          checked={completed}
          disabled={saving}
          onChange={(event) => updateCompletion(event.target.checked)}
          className="size-4 accent-emerald-600"
        />
        <span>{completed ? "Gjennomført" : "Marker som gjennomført"}</span>
        {saving && <span className="sr-only">Lagrer</span>}
      </label>
      {error && (
        <p className="mt-1 text-xs font-medium text-red-600" role="alert">
          {error}. Prøv igjen.
        </p>
      )}
    </div>
  );
}
