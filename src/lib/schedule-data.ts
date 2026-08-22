import { createClient } from "@/lib/supabase/server";
import { resolveSeasons } from "@/lib/player-browser";
import { REGULAR_SEASON_WEEKS } from "@/lib/nfl-schedule";
import type { GameRow } from "@/lib/nfl-schedule";

export type Game = Omit<GameRow, "updated_at">;

export { REGULAR_SEASON_WEEKS };

/**
 * Which week to open the schedule on: the one Sleeper says is current,
 * clamped into the regular season so the preseason and the offseason both
 * land somewhere sensible rather than on week 0 or week 23.
 */
export async function defaultWeek(): Promise<{ season: number; week: number }> {
  const { current } = await resolveSeasons();
  const supabase = await createClient();

  // The next game that hasn't kicked off is a better "current week" than
  // Sleeper's counter during the preseason, when state.week counts
  // preseason weeks that have no regular-season games behind them.
  const { data } = await supabase
    .from("nfl_games")
    .select("week")
    .eq("season", current)
    .gte("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { season: current, week: data?.week ?? 1 };
}

export async function getWeekGames(season: number, week: number): Promise<Game[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nfl_games")
    .select(
      "id, season, week, season_type, kickoff_at, home_team, away_team, home_name, away_name, home_score, away_score, status, status_detail, network, venue, neutral_site",
    )
    .eq("season", season)
    .eq("week", week)
    .order("kickoff_at", { ascending: true });
  return (data ?? []) as Game[];
}

export async function getTeamGames(season: number, team: string): Promise<Game[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nfl_games")
    .select(
      "id, season, week, season_type, kickoff_at, home_team, away_team, home_name, away_name, home_score, away_score, status, status_detail, network, venue, neutral_site",
    )
    .eq("season", season)
    .or(`home_team.eq.${team},away_team.eq.${team}`)
    .order("week", { ascending: true });
  return (data ?? []) as Game[];
}

/** Every team with a game this season, for the filter. */
export async function getTeams(season: number): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nfl_games")
    .select("home_team")
    .eq("season", season);
  const teams = new Set<string>();
  for (const row of data ?? []) {
    if (row.home_team) teams.add(row.home_team as string);
  }
  return [...teams].sort();
}

/**
 * The NFL's own idea of what day a game is on.
 *
 * Kickoffs are stored in UTC, and a US night game is already past midnight
 * there: New England at Seattle kicks at 8:20 PM Eastern on Wednesday and
 * is stored as 2026-09-10T00:20Z. Slicing the ISO string put it — and
 * every other primetime game — on the following day.
 *
 * Eastern is the right bucket rather than the viewer's own timezone,
 * because the league schedules in it. "Thursday Night Football" is a
 * Thursday game whether you watch it from Denver or Dublin, and it is how
 * every schedule anyone would compare this against is laid out.
 */
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function easternDay(iso: string): string {
  return EASTERN_DAY.format(new Date(iso));
}

/** Groups a week's games under the day they're played. */
export function byDay(games: Game[]): { day: string; games: Game[] }[] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const key = g.kickoff_at ? easternDay(g.kickoff_at) : "tbd";
    const bucket = groups.get(key);
    if (bucket) bucket.push(g);
    else groups.set(key, [g]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, games]) => ({ day, games }));
}
