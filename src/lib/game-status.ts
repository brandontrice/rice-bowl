import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamGame = {
  team: string;
  opponent: string | null;
  home: boolean;
  kickoff_at: string | null;
  status: string | null;
  status_detail: string | null;
  time_valid: boolean;
  locked: boolean;
};

/**
 * This week's game for every team, keyed by team code.
 *
 * `locked` is the one that matters during a draft: a player is off the
 * board once their own game has kicked off, not once the week's first
 * game has. Teams on a bye simply have no entry.
 */
export async function getWeekTeamGames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
  week: number,
): Promise<Map<string, TeamGame>> {
  const { data } = await supabase
    .from("nfl_games")
    .select("home_team, away_team, kickoff_at, status, status_detail, time_valid")
    .eq("season", season)
    .eq("week", week);

  const now = Date.now();
  const map = new Map<string, TeamGame>();

  for (const g of data ?? []) {
    const kickoff = g.kickoff_at ? new Date(g.kickoff_at).getTime() : null;
    // Status is the stronger signal — a game in progress or finished is
    // locked regardless of what the stored kick time says.
    const locked =
      g.status === "in" ||
      g.status === "post" ||
      (kickoff !== null && kickoff <= now);

    for (const [team, opponent, home] of [
      [g.home_team, g.away_team, true],
      [g.away_team, g.home_team, false],
    ] as [string | null, string | null, boolean][]) {
      if (!team) continue;
      map.set(team, {
        team,
        opponent,
        home,
        kickoff_at: g.kickoff_at,
        status: g.status,
        status_detail: g.status_detail,
        time_valid: g.time_valid ?? true,
        locked,
      });
    }
  }

  return map;
}
