"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import type { Player } from "@/types/database";

export type KeepCandidate = {
  playerId: string;
  player: Player | null;
  points: number | null;
  slot: string;
  alreadyKept: boolean;
};

/**
 * Choose one player off a finished week to keep for good.
 *
 * One per week, so by Week 9 the whole roster is yours and there is
 * nothing left to draft — which is where evictions take over.
 */
export function KeepPanel({
  weekId,
  weekNumber,
  candidates,
  keepsHeld,
  chosen,
}: {
  weekId: string;
  weekNumber: number;
  candidates: KeepCandidate[];
  keepsHeld: number;
  /** The player already kept off this week, if the choice is made. */
  chosen: KeepCandidate | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function keep(playerId: string) {
    setBusy(playerId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("keep_player", {
      p_week_id: weekId,
      p_player_id: playerId,
    });
    setBusy(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  const remaining = 8 - keepsHeld;

  return (
    <Panel
      title={`Keep one from week ${weekNumber}`}
      action={
        <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {keepsHeld}/8 kept
        </span>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {chosen ? (
        <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-3">
          {chosen.player && (
            <PlayerAvatar
              playerId={chosen.playerId}
              name={chosen.player.full_name}
              position={chosen.player.position}
              team={chosen.player.team}
              size="sm"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {chosen.player?.full_name ?? chosen.playerId}
            </span>
            <span className="font-data text-[10px] text-ink-faint">
              Kept for the rest of the season
            </span>
          </span>
          <span className="tabular-score ml-auto text-sm text-accent">
            {remaining > 0 ? `${remaining} slots still open` : "Full house"}
          </span>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-dim">
            One of these carries into every remaining week. The rest go back in the pool.
          </p>

          {error && (
            <p role="alert" className="text-sm text-crimson">
              {error}
            </p>
          )}

          <div className="flex flex-col divide-y divide-seam-soft">
            {candidates.map((c) => (
              <div key={c.playerId} className="flex items-center gap-2.5 py-2">
                <span className="label w-9 shrink-0">{c.slot}</span>
                {c.player && (
                  <PlayerAvatar
                    playerId={c.playerId}
                    name={c.player.full_name}
                    position={c.player.position}
                    team={c.player.team}
                    size="sm"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {c.player?.full_name ?? c.playerId}
                  </span>
                  {c.alreadyKept && (
                    <span className="font-data text-[10px] text-ink-faint">
                      Already a resident
                    </span>
                  )}
                </span>
                <span className="tabular-score w-12 text-right text-sm text-ink-dim">
                  {c.points !== null ? c.points.toFixed(1) : "—"}
                </span>
                <button
                  type="button"
                  disabled={c.alreadyKept || busy !== null}
                  onClick={() => keep(c.playerId)}
                  className={`w-16 shrink-0 rounded-lg border px-2 py-1.5 font-data text-[10px] uppercase tracking-wide ${
                    c.alreadyKept
                      ? "border-seam text-ink-faint"
                      : "border-accent bg-accent font-semibold text-ground hover:opacity-90"
                  } disabled:cursor-not-allowed`}
                >
                  {busy === c.playerId ? "…" : c.alreadyKept ? "Held" : "Keep"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
