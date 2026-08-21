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
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded-full border border-seam px-2.5 py-1 font-data text-[10px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      {error && <span className="text-xs text-crimson">{error}</span>}
    </span>
  );
}
