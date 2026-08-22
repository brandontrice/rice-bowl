import type { SupabaseClient } from "@supabase/supabase-js";

const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export const REGULAR_SEASON_WEEKS = 18;

/**
 * ESPN and Sleeper disagree on exactly one abbreviation. Normalising to
 * Sleeper's keeps `nfl_games.home_team` joinable against `players.team`.
 */
const TEAM_ALIASES: Record<string, string> = { WSH: "WAS" };

function normalizeTeam(abbr: string | undefined | null): string | null {
  if (!abbr) return null;
  const upper = abbr.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
}

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  team?: { abbreviation?: string; displayName?: string };
};

type EspnEvent = {
  id?: string;
  date?: string;
  week?: { number?: number };
  competitions?: {
    neutralSite?: boolean;
    timeValid?: boolean;
    venue?: { fullName?: string };
    competitors?: EspnCompetitor[];
    status?: { type?: { state?: string; shortDetail?: string } };
    broadcasts?: { market?: string; names?: string[] }[];
  }[];
};

export type GameRow = {
  id: string;
  season: number;
  week: number;
  season_type: string;
  kickoff_at: string | null;
  home_team: string | null;
  away_team: string | null;
  home_name: string | null;
  away_name: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  status_detail: string | null;
  network: string | null;
  venue: string | null;
  neutral_site: boolean;
  time_valid: boolean;
  updated_at: string;
};

function toRow(event: EspnEvent, season: number, week: number): GameRow | null {
  const comp = event.competitions?.[0];
  if (!event.id || !comp) return null;

  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  const score = (raw: string | undefined) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  // Prefer the national feed — that's the one that makes a game primetime.
  const broadcasts = comp.broadcasts ?? [];
  const national = broadcasts.find((b) => b.market === "national");
  const network = (national ?? broadcasts[0])?.names?.[0] ?? null;

  return {
    id: event.id,
    season,
    week: event.week?.number ?? week,
    season_type: "regular",
    kickoff_at: event.date ? new Date(event.date).toISOString() : null,
    home_team: normalizeTeam(home?.team?.abbreviation),
    away_team: normalizeTeam(away?.team?.abbreviation),
    home_name: home?.team?.displayName ?? null,
    away_name: away?.team?.displayName ?? null,
    home_score: score(home?.score),
    away_score: score(away?.score),
    status: comp.status?.type?.state ?? null,
    status_detail: comp.status?.type?.shortDetail ?? null,
    network,
    venue: comp.venue?.fullName ?? null,
    neutral_site: Boolean(comp.neutralSite),
    // false when the NFL has not fixed a kick time yet — the whole of
    // Week 18 sits like this until late in the season.
    time_valid: comp.timeValid !== false,
    updated_at: new Date().toISOString(),
  };
}

/** One week of games from ESPN. Empty on any failure — never throws. */
export async function fetchWeekGames(season: number, week: number): Promise<GameRow[]> {
  try {
    const res = await fetch(`${SCOREBOARD}?seasontype=2&week=${week}&dates=${season}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: EspnEvent[] };
    return (json.events ?? [])
      .map((e) => toRow(e, season, week))
      .filter((r): r is GameRow => r !== null);
  } catch {
    return [];
  }
}

/**
 * Stores the season's schedule. `weeks` defaults to the whole regular
 * season; the score cron passes just the current one so live scores and
 * status move without re-pulling all eighteen.
 */
export async function syncSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
  weeks?: number[],
): Promise<number> {
  const targets =
    weeks ?? Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);

  const batches = await Promise.all(targets.map((w) => fetchWeekGames(season, w)));
  const rows = batches.flat();
  if (rows.length === 0) return 0;

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("nfl_games")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw new Error(`nfl_games: ${error.message}`);
  }
  return rows.length;
}
