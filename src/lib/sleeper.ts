import type { Player } from "@/types/database";

const SLEEPER_BASE = "https://api.sleeper.app/v1";

// Positions we actually draft. Sleeper represents defenses as a "player"
// whose id is the team abbreviation (e.g. "SEA") with position "DEF".
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "DEF"]);

type SleeperPlayer = {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  years_exp?: number | null;
  status?: string | null;
  fantasy_positions?: string[] | null;
  espn_id?: number | string | null;
};

export type SleeperPoolPlayer = Omit<
  Player,
  "ppg" | "pos_rank" | "games_played" | "proj_ppg" | "proj_points" | "adp"
>;

export async function fetchSleeperPlayerPool(): Promise<SleeperPoolPlayer[]> {
  const res = await fetch(`${SLEEPER_BASE}/players/nfl`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Sleeper players fetch failed: ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, SleeperPlayer>;

  const players: SleeperPoolPlayer[] = [];
  for (const p of Object.values(raw)) {
    if (!p.position || !FANTASY_POSITIONS.has(p.position)) continue;
    if (!p.team) continue; // skip free agents / retired players
    if (p.position !== "DEF" && p.status !== "Active") continue;

    const fullName =
      p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!fullName) continue;

    players.push({
      id: p.player_id,
      full_name: fullName,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      position: p.position,
      team: p.team,
      years_exp: p.years_exp ?? null,
      status: p.status ?? null,
      fantasy_positions: p.fantasy_positions ?? null,
      espn_id: p.espn_id != null ? String(p.espn_id) : null,
      updated_at: new Date().toISOString(),
    });
  }
  return players;
}

export type SleeperState = {
  season: string;
  season_type: "pre" | "regular" | "post";
  week: number;
};

export async function fetchSleeperState(): Promise<SleeperState> {
  const res = await fetch(`${SLEEPER_BASE}/state/nfl`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sleeper state fetch failed: ${res.status}`);
  }
  return (await res.json()) as SleeperState;
}

export type SleeperStatLine = Record<string, number>;

export async function fetchSleeperWeekStats(
  season: number,
  week: number,
  seasonType: "regular" | "post" = "regular",
): Promise<Record<string, SleeperStatLine>> {
  const res = await fetch(
    `${SLEEPER_BASE}/stats/nfl/${seasonType}/${season}/${week}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Sleeper stats fetch failed: ${res.status}`);
  }
  return (await res.json()) as Record<string, SleeperStatLine>;
}

/**
 * Season-to-date totals for every player, keyed by Sleeper player_id.
 * Includes `gp` (games played) and `pts_half_ppr`, which is all we need
 * to rank the draft pool by production.
 */
export async function fetchSleeperSeasonStats(
  season: number,
  seasonType: "regular" | "post" = "regular",
): Promise<Record<string, SleeperStatLine>> {
  const res = await fetch(`${SLEEPER_BASE}/stats/nfl/${seasonType}/${season}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Sleeper season stats fetch failed: ${res.status}`);
  }
  return (await res.json()) as Record<string, SleeperStatLine>;
}

/**
 * Sleeper's projections. Undocumented but stable, and the only
 * forward-looking numbers available without a paid provider.
 *
 * Omit `week` for whole-season projections; pass one for that week's.
 * Season projections also carry average draft position (`adp_half_ppr`
 * and friends), which is the closest thing to a consensus ranking.
 */
export async function fetchSleeperProjections(
  season: number,
  week?: number,
  seasonType: "regular" | "post" = "regular",
): Promise<Record<string, SleeperStatLine>> {
  const path = week
    ? `${SLEEPER_BASE}/projections/nfl/${seasonType}/${season}/${week}`
    : `${SLEEPER_BASE}/projections/nfl/${seasonType}/${season}`;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sleeper projections fetch failed: ${res.status}`);
  }
  return (await res.json()) as Record<string, SleeperStatLine>;
}
