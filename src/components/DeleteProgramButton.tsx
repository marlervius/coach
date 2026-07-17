"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProgramButton({ id, athleteName }: { id: string; athleteName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !confirm(
        `Slette programmet til ${athleteName}? Utøverens lenke slutter å virke. Dette kan ikke angres.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/program/${id}`, { method: "DELETE" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        alert("Kunne ikke slette programmet – prøv igjen.");
        return;
      }
      router.refresh();
    } catch {
      alert("Kunne ikke slette programmet – prøv igjen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      title={`Slett programmet til ${athleteName}`}
      className="border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors shrink-0"
    >
      {busy ? "Sletter…" : "Slett"}
    </button>
  );
}
