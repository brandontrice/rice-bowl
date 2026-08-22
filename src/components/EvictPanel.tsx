"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import type { Player } from "@/types/database";

export type Resident = {
  playerId: string;
  player: Player | null;
  slot: string;
};

/**
 * Full House: every slot is a keep, so nothing is left to draft.
 *
 * From here the roster stops growing and starts turning over. Evict one
 * resident and next week's draft is exactly one pick long — their
 * replacement. Do it every week for the rest of the season.
 */
export function EvictPanel({
  seasonId,
  forWeek,
  residents,
  evicted,
}: {
  seasonId: string;
  forWeek: number;
  residents: Resident[];
  /** Already evicted for this week, if the choice is made. */
  evicted: Resident | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function evict(playerId: string) {
    setBusy(playerId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("evict_player", {
      p_season_id: seasonId,
      p_player_id: playerId,
      p_for_week: forWeek,
    });
    setBusy(null);
    setConfirming(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <Panel
      title="Full house"
      action={
        <span className="font-data text-[10px] uppercase tracking-[0.1em] text-crimson">
          Eviction week {forWeek}
        </span>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {evicted ? (
        <div className="flex items-center gap-3 rounded-xl border border-crimson/40 bg-crimson/10 px-3.5 py-3">
          {evicted.player && (
            <PlayerAvatar
              playerId={evicted.playerId}
              name={evicted.player.full_name}
              position={evicted.player.position}
              team={evicted.player.team}
              size="sm"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {evicted.player?.full_name ?? evicted.playerId}
            </span>
            <span className="font-data text-[10px] text-ink-faint">
              Evicted — week {forWeek} drafts their replacement
            </span>
          </span>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-dim">
            Every slot is yours, so there is nothing left to draft. Evict one resident and week{" "}
            {forWeek} becomes a one-pick draft for their replacement.
          </p>

          {error && (
            <p role="alert" className="text-sm text-crimson">
              {error}
            </p>
          )}

          <div className="flex flex-col divide-y divide-seam-soft">
            {residents.map((r) => (
              <div key={r.playerId} className="flex items-center gap-2.5 py-2">
                <span className="label w-9 shrink-0">{r.slot}</span>
                {r.player && (
                  <PlayerAvatar
                    playerId={r.playerId}
                    name={r.player.full_name}
                    position={r.player.position}
                    team={r.player.team}
                    size="sm"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {r.player?.full_name ?? r.playerId}
                </span>

                {confirming === r.playerId ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => evict(r.playerId)}
                      className="rounded-lg bg-crimson px-2.5 py-1.5 font-data text-[10px] uppercase tracking-wide font-semibold text-ground"
                    >
                      {busy === r.playerId ? "…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded-lg border border-seam px-2.5 py-1.5 font-data text-[10px] uppercase tracking-wide text-ink-dim"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  // Confirmed rather than one-click: an eviction is permanent
                  // and there is no undo once next week is built.
                  <button
                    type="button"
                    onClick={() => setConfirming(r.playerId)}
                    className="w-16 shrink-0 rounded-lg border border-crimson/40 px-2 py-1.5 font-data text-[10px] uppercase tracking-wide text-crimson hover:bg-crimson/10"
                  >
                    Evict
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
