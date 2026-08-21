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
 * How many entries carry a real games-played count.
 *
 * In the preseason, Sleeper's stats endpoint for the current year answers
 * 200 with thousands of entries that hold only projection *rank* fields —
 * no `gp`, no `pts_half_ppr`. So "did the request return anything" is not
 * a usable test for whether a season can be ranked from; this is.
 */
function usableStatLines(stats: Record<string, SleeperStatLine>): number {
  let count = 0;
  for (const line of Object.values(stats)) {
    if (typeof line?.gp === "number" && line.gp > 0) count++;
  }
  return count;
}

const MIN_USABLE_LINES = 50;

/**
 * Pulls Sleeper's player pool, attaches a production ranking, and upserts.
 *
 * The ranking is what makes the draft board sortable by "best available"
 * instead of alphabetically, and is derived from half-PPR points per game
 * over whichever season actually has production in it — see the comments
 * below, because "the current season" is the wrong answer for a chunk of
 * the year.
 */
export async function syncPlayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ synced: number; ranked: number; rankedFrom: number | null }> {
  const [players, state] = await Promise.all([
    fetchSleeperPlayerPool(),
    fetchSleeperState(),
  ]);

  const seasonYear = Number(state.season);

  // During the preseason the previous year is the only season with real
  // production in it, so try it first rather than falling back to it.
  const candidates = Number.isFinite(seasonYear)
    ? state.season_type === "pre"
      ? [seasonYear - 1, seasonYear]
      : [seasonYear, seasonYear - 1]
    : [];

  let stats: Record<string, SleeperStatLine> = {};
  let rankedFrom: number | null = null;
  for (const year of candidates) {
    const attempt = await fetchSleeperSeasonStats(year).catch(() => ({}));
    if (usableStatLines(attempt) >= MIN_USABLE_LINES) {
      stats = attempt;
      rankedFrom = year;
      break;
    }
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

  return {
    synced: ranked.length,
    ranked: ranked.filter((p) => p.pos_rank !== null).length,
    rankedFrom,
  };
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
