import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSleeperPlayerPool,
  fetchSleeperSeasonStats,
  fetchSleeperState,
  type SleeperStatLine,
} from "@/lib/sleeper";
import { computeWeeklyPoints } from "@/lib/scoring";
import { syncSeasonStats, syncWeekStats } from "@/lib/player-stats";
import { resolveMissingEspnIds } from "@/lib/espn-ids";
import { syncProjections } from "@/lib/projections";
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

/** Weeks in a modern NFL regular season. */
const REGULAR_SEASON_WEEKS = 18;

/** Have we already stored a game log for this season? */
async function hasWeeksFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
): Promise<boolean> {
  const { count } = await supabase
    .from("player_week_stats")
    .select("player_id", { count: "exact", head: true })
    .eq("season", season);
  return (count ?? 0) > 0;
}

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
): Promise<{
  synced: number;
  ranked: number;
  rankedFrom: number | null;
  seasonRows: number;
  weekRows: number;
  espnIdsResolved: number;
  projected: number;
  projectionsMirrored: number;
  withAdp: number;
}> {
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

  // Deliberately without the projection columns: syncProjections owns
  // those, and including them here as null would blank them on every sync.
  type RankedRow = Omit<Player, "proj_ppg" | "proj_points" | "adp">;

  const ranked: RankedRow[] = players.map((p) => {
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
  const byPosition = new Map<string, RankedRow[]>();
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

  // Stat history for the rankings browser. The previous season is fixed
  // and fetched wholesale; the current one is filled week by week so the
  // same rows can be topped up live during games.
  const knownIds = new Set(ranked.map((p) => p.id));
  let seasonRows = 0;
  let weekRows = 0;

  if (Number.isFinite(seasonYear)) {
    seasonRows = await syncSeasonStats(supabase, seasonYear - 1, knownIds);

    // Backfill last season's game log once. Without it the player pages
    // have nothing to show between February and September, which is most
    // of the year. It never changes again, so this is skipped thereafter.
    if (!(await hasWeeksFor(supabase, seasonYear - 1))) {
      for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
        weekRows += await syncWeekStats(supabase, seasonYear - 1, week, knownIds);
      }
    }

    // In the preseason state.week counts preseason weeks, which have no
    // regular-season stats behind them.
    const throughWeek = state.season_type === "pre" ? 0 : Math.max(0, state.week);
    for (let week = 1; week <= throughWeek; week++) {
      weekRows += await syncWeekStats(supabase, seasonYear, week, knownIds);
    }
  }

  // Forward-looking numbers for the current season. In a redraft league
  // that runs weekly, a projection is often more use than last year.
  const projections = Number.isFinite(seasonYear)
    ? await syncProjections(supabase, seasonYear, knownIds).catch(() => ({
        projected: 0,
        mirrored: 0,
        withAdp: 0,
      }))
    : { projected: 0, mirrored: 0, withAdp: 0 };

  // Sleeper only carries an espn_id for about a fifth of the pool, and the
  // gaps include names like Ja'Marr Chase — resolve the rest off ESPN's
  // team rosters so the player pages have news to show.
  const espn = await resolveMissingEspnIds(supabase).catch(() => ({
    attempted: 0,
    resolved: 0,
  }));

  return {
    synced: ranked.length,
    ranked: ranked.filter((p) => p.pos_rank !== null).length,
    rankedFrom,
    seasonRows,
    weekRows,
    espnIdsResolved: espn.resolved,
    projected: projections.projected,
    projectionsMirrored: projections.mirrored,
    withAdp: projections.withAdp,
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
