import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSleeperSeasonStats,
  fetchSleeperWeekStats,
  type SleeperStatLine,
} from "@/lib/sleeper";

const BATCH = 500;

/** Sleeper hands us half-PPR totals directly; no need to recompute them. */
function pointsOf(line: SleeperStatLine): number | null {
  return typeof line.pts_half_ppr === "number" ? line.pts_half_ppr : null;
}

/** Skip the thousands of entries that are only projection-rank noise. */
function hasProduction(line: SleeperStatLine): boolean {
  return typeof line.gp === "number" || typeof line.pts_half_ppr === "number";
}

async function upsertAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + BATCH), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * Stores a completed season's totals. These never change again once the
 * season is over, so this only needs to run when a new season finishes —
 * the daily sync re-runs it anyway, which costs one request.
 *
 * `knownPlayerIds` exists because player_season_stats has a foreign key to
 * players, and Sleeper's stat dump includes retired and practice-squad
 * players we deliberately never cached.
 */
export async function syncSeasonStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
  knownPlayerIds: Set<string>,
): Promise<number> {
  const stats: Record<string, SleeperStatLine> = await fetchSleeperSeasonStats(
    season,
  ).catch(() => ({}));
  const updatedAt = new Date().toISOString();

  const rows = Object.entries(stats)
    .filter(([id, line]) => knownPlayerIds.has(id) && hasProduction(line))
    .map(([id, line]) => {
      const games = typeof line.gp === "number" ? line.gp : 0;
      const points = pointsOf(line);
      return {
        player_id: id,
        season,
        games_played: games || null,
        points,
        ppg: games > 0 && points !== null ? Math.round((points / games) * 10) / 10 : null,
        stats: line,
        updated_at: updatedAt,
      };
    });

  await upsertAll(supabase, "player_season_stats", rows, "player_id,season");
  return rows.length;
}

/**
 * Stores one week of the current season. Called by the daily sync to
 * backfill, and by the matchup scoring path so this year's numbers move
 * while games are being played.
 */
export async function syncWeekStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
  week: number,
  knownPlayerIds: Set<string>,
  preloaded?: Record<string, SleeperStatLine>,
): Promise<number> {
  const stats: Record<string, SleeperStatLine> =
    preloaded ?? (await fetchSleeperWeekStats(season, week).catch(() => ({})));
  const updatedAt = new Date().toISOString();

  const rows = Object.entries(stats)
    .filter(([id, line]) => knownPlayerIds.has(id) && hasProduction(line))
    .map(([id, line]) => ({
      player_id: id,
      season,
      week,
      points: pointsOf(line),
      stats: line,
      updated_at: updatedAt,
    }));

  await upsertAll(supabase, "player_week_stats", rows, "player_id,season,week");
  return rows.length;
}

/** Every player id we have cached — the FK gate for the two syncs above. */
export async function loadKnownPlayerIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("players")
      .select("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.add(row.id as string);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}
