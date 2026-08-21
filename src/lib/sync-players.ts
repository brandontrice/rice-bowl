import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSleeperPlayerPool,
  fetchSleeperSeasonStats,
  fetchSleeperState,
  type SleeperStatLine,
} from "@/lib/sleeper";
import { computeWeeklyPoints } from "@/lib/scoring";
import type { Player } from "@/types/database";

const STALE_MS = 12 * 60 * 60 * 1000; // Sleeper's dump barely moves intra-day.
const BATCH = 500;

/** True when the cached pool is empty or older than the staleness window. */
export async function isPlayerPoolStale(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<boolean> {
  const { data: latest } = await supabase
    .from("players")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return !latest || Date.now() - new Date(latest.updated_at).getTime() > STALE_MS;
}

/**
 * Pulls Sleeper's player pool, attaches a production ranking, and upserts.
 *
 * The ranking is what makes the draft board sortable by "best available"
 * instead of alphabetically. It is derived from season-to-date half-PPR
 * points per game; in the opening weeks of a season those are empty, so we
 * fall back to last season rather than shipping an unranked board.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPlayers(supabase: SupabaseClient<any>): Promise<number> {
  const [players, state] = await Promise.all([
    fetchSleeperPlayerPool(),
    fetchSleeperState(),
  ]);

  const seasonYear = Number(state.season);
  let stats: Record<string, SleeperStatLine> = await fetchSleeperSeasonStats(
    seasonYear,
  ).catch(() => ({}));
  if (Object.keys(stats).length === 0 && Number.isFinite(seasonYear)) {
    stats = await fetchSleeperSeasonStats(seasonYear - 1).catch(() => ({}));
  }

  const ranked: Player[] = players.map((p) => {
    const line = stats[p.id];
    const games = line?.gp ?? 0;
    let ppg: number | null = null;

    if (line && games > 0) {
      const total =
        typeof line.pts_half_ppr === "number"
          ? line.pts_half_ppr
          : computeWeeklyPoints(p.position, line, "__base__").points;
      ppg = Math.round((total / games) * 10) / 10;
    }

    return { ...p, ppg, pos_rank: null, games_played: games || null };
  });

  // Rank within position so the board can show "RB14" rather than a raw
  // overall number, which is meaningless across positions.
  const byPosition = new Map<string, Player[]>();
  for (const p of ranked) {
    const key = p.position ?? "NA";
    const bucket = byPosition.get(key);
    if (bucket) bucket.push(p);
    else byPosition.set(key, [p]);
  }
  for (const bucket of byPosition.values()) {
    bucket
      .filter((p) => p.ppg !== null)
      .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0))
      .forEach((p, i) => {
        p.pos_rank = i + 1;
      });
  }

  for (let i = 0; i < ranked.length; i += BATCH) {
    const { error } = await supabase
      .from("players")
      .upsert(ranked.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  return ranked.length;
}

/**
 * Refreshes the pool only if it's stale.
 *
 * This must never be awaited inside a page render — a cold or stale cache
 * means a multi-megabyte Sleeper fetch plus ~20 sequential upsert batches,
 * and the manager opening the draft room would wait on all of it. Callers
 * on a request path should hand this to `after()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePlayersSynced(supabase: SupabaseClient<any>): Promise<void> {
  if (!(await isPlayerPoolStale(supabase))) return;
  await syncPlayers(supabase);
}
