"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Manager, Wager } from "@/types/database";

type WagerRow = Wager & { week_number?: number };

export function WagerLedger({
  weekId,
  managers,
  initial,
  showWeekColumn = false,
}: {
  weekId: string;
  managers: Manager[];
  initial: WagerRow[];
  showWeekColumn?: boolean;
}) {
  const [wagers, setWagers] = useState<WagerRow[]>(initial);
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const managerById = new Map(managers.map((m) => [m.id, m]));

  async function addWager() {
    if (!description.trim()) return;
    setAdding(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("wagers")
      .insert({ week_id: weekId, description: description.trim() })
      .select("*")
      .single();
    if (data) setWagers((prev) => [data as WagerRow, ...prev]);
    setDescription("");
    setAdding(false);
  }

  async function settle(id: string, loserId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("wagers")
      .update({ status: "settled", loser_manager_id: loserId })
      .eq("id", id)
      .select("*")
      .single();
    if (data) setWagers((prev) => prev.map((w) => (w.id === id ? { ...w, ...(data as Wager) } : w)));
  }

  return (
    <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-canvas-muted">
        Wager Ledger
      </h3>

      {wagers.length === 0 && <p className="text-sm text-canvas-muted">No wagers logged yet.</p>}

      <div className="flex flex-col gap-2">
        {wagers.map((w) => (
          <div key={w.id} className="rounded-xl border border-canvas-border/70 bg-canvas p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-canvas-fg">
                {showWeekColumn && w.week_number ? (
                  <span className="mr-2 text-xs text-canvas-muted">Wk {w.week_number}</span>
                ) : null}
                {w.description}
              </p>
              {w.status === "settled" ? (
                <span className="shrink-0 text-xs text-canvas-muted">
                  {w.loser_manager_id ? `${managerById.get(w.loser_manager_id)?.display_name} pays up` : "Settled"}
                </span>
              ) : null}
            </div>
            {w.status === "pending" && (
              <div className="mt-2 flex gap-2">
                {managers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => settle(w.id, m.id)}
                    className="rounded-full border border-canvas-border px-2.5 py-1 text-xs text-canvas-muted hover:border-accent hover:text-canvas-fg"
                  >
                    {m.display_name} loses
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Loser cooks dinner…"
          className="flex-1 rounded-lg border border-canvas-border bg-canvas px-3 py-2 text-sm text-canvas-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={addWager}
          disabled={adding}
          className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
