"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshScoresButton({ weekId }: { weekId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch(`/api/score/${weekId}`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to refresh scores");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded-lg border border-seam px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh scores"}
      </button>
      {error && <span className="text-xs text-crimson">{error}</span>}
    </div>
  );
}
