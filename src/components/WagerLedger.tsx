"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
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
  const [error, setError] = useState<string | null>(null);

  const managerById = new Map(managers.map((m) => [m.id, m]));

  async function addWager() {
    if (!description.trim()) return;
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("wagers")
      .insert({ week_id: weekId, description: description.trim() })
      .select("*")
      .single();
    if (insertError) {
      setError("That wager didn't save. Try again.");
      setAdding(false);
      return;
    }
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

  const pending = wagers.filter((w) => w.status === "pending").length;

  return (
    <Panel
      title="Wager Ledger"
      action={
        pending > 0 ? (
          <span className="font-data text-[10px] uppercase tracking-[0.1em] text-flare">
            {pending} unsettled
          </span>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-4"
    >
      {wagers.length === 0 ? (
        <p className="text-sm text-ink-dim">
          Nothing on the line yet. Wagers are settled by hand — the app just remembers them.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {wagers.map((w) => {
            const loser = w.loser_manager_id ? managerById.get(w.loser_manager_id) : null;
            return (
              <div
                key={w.id}
                className="rounded-xl border border-seam-soft bg-ground p-3 text-sm"
                style={loser ? { borderLeftColor: loser.accent_color, borderLeftWidth: 2 } : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-ink">
                    {showWeekColumn && w.week_number ? (
                      <span className="mr-2 font-data text-[10px] text-ink-faint">
                        WK {w.week_number}
                      </span>
                    ) : null}
                    {w.description}
                  </p>
                  {w.status === "settled" && (
                    <span className="shrink-0 font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                      {loser ? `${loser.display_name} pays` : "Settled"}
                    </span>
                  )}
                </div>
                {w.status === "pending" && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {managers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => settle(w.id, m.id)}
                        className="rounded-full border border-seam px-2.5 py-1 font-data text-[10px] uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-ink"
                      >
                        {m.display_name} loses
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addWager();
            }}
            placeholder="Loser cooks dinner…"
            aria-label="New wager"
            className="min-w-0 flex-1 rounded-lg border border-seam bg-ground px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            type="button"
            onClick={addWager}
            disabled={adding || !description.trim()}
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-ground transition hover:opacity-90 disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <p className="text-xs text-crimson">{error}</p>}
      </div>
    </Panel>
  );
}
