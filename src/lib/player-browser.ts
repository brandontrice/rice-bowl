import { BROWSABLE_POSITIONS } from "@/lib/positions";
import { createClient } from "@/lib/supabase/server";
import { fetchSleeperState } from "@/lib/sleeper";
import type { Player } from "@/types/database";

export type SeasonLine = {
  season: number;
  games_played: number | null;
  points: number | null;
  ppg: number | null;
};

export type ProjectionLine = {
  season: number;
  points: number | null;
  ppg: number | null;
  adp: number | null;
};

export type RankedPlayer = Player & {
  lastSeason: SeasonLine | null;
  thisSeason: SeasonLine | null;
};

export { BROWSABLE_POSITIONS } from "@/lib/positions";

export type PlayerSort = "adp" | "proj" | "last";

/** Column and direction per sort. ADP counts up; the rest count down. */
const SORTS: Record<PlayerSort, { column: string; ascending: boolean }> = {
  adp: { column: "adp", ascending: true },
  proj: { column: "proj_ppg", ascending: false },
  last: { column: "ppg", ascending: false },
};

/** Which season is "this year" and which is "last year", per Sleeper. */
export async function resolveSeasons(): Promise<{ current: number; previous: number }> {
  try {
    const state = await fetchSleeperState();
    const current = Number(state.season);
    if (Number.isFinite(current)) return { current, previous: current - 1 };
  } catch {
    // fall through
  }
  const year = new Date().getUTCFullYear();
  return { current: year, previous: year - 1 };
}

/**
 * The rankings list. Ordered by last completed season's points per game,
 * because early in a season that is the only signal there is — the
 * current-season column fills in beside it as games are played.
 */
export async function listRankedPlayers({
  position,
  search,
  sort = "last",
  limit = 200,
}: {
  position?: string;
  search?: string;
  sort?: PlayerSort;
  limit?: number;
}): Promise<{ players: RankedPlayer[]; seasons: { current: number; previous: number } }> {
  const supabase = await createClient();
  const seasons = await resolveSeasons();

  // Nulls last in every case: a player with no ADP, no projection or no
  // production last season should sit behind everyone who has one rather
  // than lead the list because the column is empty.
  const ordering = SORTS[sort] ?? SORTS.last;

  let query = supabase
    .from("players")
    .select("*")
    .in("position", [...BROWSABLE_POSITIONS])
    .order(ordering.column, { ascending: ordering.ascending, nullsFirst: false })
    .order("full_name", { ascending: true })
    .limit(limit);

  if (position && position !== "ALL") query = query.eq("position", position);
  if (search?.trim()) query = query.ilike("full_name", `%${search.trim()}%`);

  const { data: playersRaw } = await query;
  const players = (playersRaw ?? []) as Player[];
  if (players.length === 0) return { players: [], seasons };

  const ids = players.map((p) => p.id);

  const [{ data: lastRows }, { data: thisRows }] = await Promise.all([
    supabase
      .from("player_season_stats")
      .select("player_id, season, games_played, points, ppg")
      .eq("season", seasons.previous)
      .in("player_id", ids),
    supabase
      .from("player_season_to_date")
      .select("player_id, season, games_played, points, ppg")
      .eq("season", seasons.current)
      .in("player_id", ids),
  ]);

  const lastBy = new Map((lastRows ?? []).map((r) => [r.player_id as string, r as SeasonLine]));
  const thisBy = new Map((thisRows ?? []).map((r) => [r.player_id as string, r as SeasonLine]));

  return {
    players: players.map((p) => ({
      ...p,
      lastSeason: lastBy.get(p.id) ?? null,
      thisSeason: thisBy.get(p.id) ?? null,
    })),
    seasons,
  };
}

export type WeekLine = { week: number; points: number | null; stats: Record<string, number> };

/** Everything the player detail page needs, minus the news. */
export async function getPlayerDetail(playerId: string) {
  const supabase = await createClient();
  const seasons = await resolveSeasons();

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return null;

  const [{ data: lastSeason }, { data: thisSeason }, { data: weeks }, { data: projection }] =
    await Promise.all([
    supabase
      .from("player_season_stats")
      .select("player_id, season, games_played, points, ppg")
      .eq("player_id", playerId)
      .eq("season", seasons.previous)
      .maybeSingle(),
    supabase
      .from("player_season_to_date")
      .select("player_id, season, games_played, points, ppg")
      .eq("player_id", playerId)
      .eq("season", seasons.current)
      .maybeSingle(),
    supabase
      .from("player_week_stats")
      .select("week, points, stats")
      .eq("player_id", playerId)
      .eq("season", seasons.current)
      .order("week", { ascending: true }),
    supabase
      .from("player_projections")
      .select("season, points, ppg, adp")
      .eq("player_id", playerId)
      .eq("season", seasons.current)
      .eq("week", 0)
      .maybeSingle(),
  ]);

  // Between February and September the current season has no games in it,
  // which is most of the year. Fall back to last season's log rather than
  // showing an empty table — labelled, so it can't be mistaken for this
  // year's form.
  let logWeeks = (weeks ?? []) as WeekLine[];
  let logSeason = seasons.current;
  if (logWeeks.length === 0) {
    const { data: prior } = await supabase
      .from("player_week_stats")
      .select("week, points, stats")
      .eq("player_id", playerId)
      .eq("season", seasons.previous)
      .order("week", { ascending: true });
    if ((prior ?? []).length > 0) {
      logWeeks = prior as WeekLine[];
      logSeason = seasons.previous;
    }
  }

  return {
    player: player as Player,
    seasons,
    lastSeason: (lastSeason ?? null) as SeasonLine | null,
    thisSeason: (thisSeason ?? null) as SeasonLine | null,
    weeks: logWeeks,
    logSeason,
    projection: (projection ?? null) as ProjectionLine | null,
  };
}
