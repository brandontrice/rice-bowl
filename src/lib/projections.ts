import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperProjections, type SleeperStatLine } from "@/lib/sleeper";

const BATCH = 500;

/**
 * Sleeper parks "no meaningful ADP" at 999 rather than omitting it.
 *
 * PPR first, to match the league's scoring — and it happens to have
 * better coverage than the half-PPR field anyway.
 */
const ADP_UNSET = 999;

/** A full NFL regular season, used when Sleeper's own count is unusable. */
const SEASON_GAMES = 18;

/**
 * Games behind a season projection.
 *
 * Sleeper reports gp=18 for skill positions but gp=1 for team defenses,
 * so dividing blindly turns a defense's season total into a "per game"
 * number roughly eighteen times too large — the Rams came out at 106 ppg.
 * Anything that small is a unit marker rather than a game count.
 */
function seasonGames(line: SleeperStatLine): number {
  const gp = typeof line.gp === "number" ? line.gp : 0;
  return gp >= 10 ? gp : SEASON_GAMES;
}

function adpOf(line: SleeperStatLine): number | null {
  // Fall through on *unusable* values, not just missing ones. Sleeper
  // writes 999 rather than null when a player has no ADP in a format, so
  // `??` never falls through — it happily returns the 999 and the player
  // ends up with no ADP at all. PPR is the league's format so it leads;
  // the other two are only there to fill gaps, and between them they cover
  // 490 of 548 projected players against 341 for PPR alone.
  for (const raw of [line.adp_ppr, line.adp_half_ppr, line.adp_std]) {
    if (typeof raw === "number" && raw > 0 && raw < ADP_UNSET) return raw;
  }
  return null;
}

/**
 * Pulls the season projections and stores them, then denormalises the two
 * numbers the lists sort by onto `players`.
 *
 * Projections are the only forward-looking figure the app has. Last
 * season's production is the only backward-looking one, and in a redraft
 * league that runs every week, both are worth showing side by side rather
 * than picking a winner.
 */
export async function syncProjections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  season: number,
  knownPlayerIds: Set<string>,
): Promise<{ projected: number; mirrored: number; withAdp: number }> {
  const projections = await fetchSleeperProjections(season).catch(() => ({}));
  const updatedAt = new Date().toISOString();

  const rows = Object.entries(projections)
    .filter(([id, line]) => knownPlayerIds.has(id) && typeof line?.pts_ppr === "number")
    .map(([id, line]) => {
      const points = line.pts_ppr as number;
      return {
        player_id: id,
        season,
        week: 0,
        points: Math.round(points * 10) / 10,
        ppg: Math.round((points / seasonGames(line)) * 10) / 10,
        adp: adpOf(line),
        stats: line,
        updated_at: updatedAt,
      };
    });

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("player_projections")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "player_id,season,week" });
    if (error) throw new Error(`player_projections: ${error.message}`);
  }

  // Mirror onto players so ordering a list by projection stays a single
  // indexed query rather than a join. Chunked rather than fired all at
  // once: a single Promise.all over ~550 updates quietly dropped about 35
  // of them.
  const UPDATE_CHUNK = 25;
  let mirrored = 0;
  for (let i = 0; i < rows.length; i += UPDATE_CHUNK) {
    const results = await Promise.all(
      rows.slice(i, i + UPDATE_CHUNK).map((r) =>
        supabase
          .from("players")
          .update({ proj_ppg: r.ppg, proj_points: r.points, adp: r.adp })
          .eq("id", r.player_id),
      ),
    );
    mirrored += results.filter((r) => !r.error).length;
  }

  return {
    projected: rows.length,
    mirrored,
    withAdp: rows.filter((r) => r.adp !== null).length,
  };
}
