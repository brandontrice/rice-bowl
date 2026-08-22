import type { SupabaseClient } from "@supabase/supabase-js";
import { assignSlot, rosterSlotDefs, TOTAL_ROSTER_SIZE } from "@/lib/draft";
import type { DraftPick, Player } from "@/types/database";

export type KeptPlayer = { player_id: string; players: Player | null };

/**
 * How many keeps a manager should be carrying into a given week.
 *
 * One per completed week, capped at a full roster: nothing after Week 1,
 * one for Week 2, and so on until Full House at Week 9.
 */
export function expectedKeeps(weekNumber: number): number {
  return Math.min(TOTAL_ROSTER_SIZE, Math.max(0, weekNumber - 1));
}

/** The players a manager carries into `forWeek`. */
export async function activeKeeps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  seasonId: string,
  managerId: string,
  forWeek: number,
): Promise<string[]> {
  const { data } = await supabase.rpc("active_keeps", {
    p_season_id: seasonId,
    p_manager_id: managerId,
    p_for_week: forWeek,
  });
  return ((data ?? []) as { player_id: string }[]).map((r) => r.player_id);
}

/**
 * Writes a manager's keeps into a new week as pre-made picks.
 *
 * Materialising them as `draft_picks` with `kept = true` means scoring,
 * the roster grid and the matchup page need no idea keeps exist — a kept
 * player is simply a pick that was already made.
 *
 * Slots are assigned from the *base* roster shape rather than the week's.
 * A House Rule restricts what you may draft; it does not evict someone you
 * already signed. Otherwise No-Fly Zone would quietly strip a kept tight
 * end off your roster.
 */
export async function materializeKeeps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  {
    draftId,
    weekId,
    managerId,
    playerIds,
  }: { draftId: string; weekId: string; managerId: string; playerIds: string[] },
): Promise<number> {
  if (playerIds.length === 0) return 0;

  const { data: players } = await supabase
    .from("players")
    .select("id, position")
    .in("id", playerIds);

  const byId = new Map((players ?? []).map((p) => [p.id as string, p.position as string | null]));

  // Base shape: no flex_flip, no positional bans.
  const slotDefs = rosterSlotDefs({ house_rule_key: "__base__", flex_position: null });
  const placed: Pick<DraftPick, "roster_slot">[] = [];
  const rows: Record<string, unknown>[] = [];

  // Most-constrained first, so a kept RB doesn't take FLEX and leave a
  // second kept RB with nowhere to go.
  const order = ["QB", "DEF", "TE", "RB", "WR"];
  const sorted = [...playerIds].sort(
    (a, b) => order.indexOf(byId.get(a) ?? "") - order.indexOf(byId.get(b) ?? ""),
  );

  // draft_picks is unique on (draft_id, pick_number), so keeps can't all sit
  // at 0. Negative numbers keep them unique, sort them ahead of the live
  // picks, and read unmistakably as "not chosen at the board".
  const { count } = await supabase
    .from("draft_picks")
    .select("id", { count: "exact", head: true })
    .eq("draft_id", draftId);
  let seq = count ?? 0;

  for (const playerId of sorted) {
    const slot = assignSlot(byId.get(playerId) ?? null, placed, slotDefs);
    if (!slot) continue; // Shouldn't happen from a valid roster; skip rather than fail the week.
    placed.push({ roster_slot: slot });
    seq += 1;
    rows.push({
      draft_id: draftId,
      week_id: weekId,
      manager_id: managerId,
      player_id: playerId,
      pick_number: -seq,
      round: 0,
      roster_slot: slot,
      kept: true,
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("draft_picks").insert(rows);
  if (error) throw new Error(`keeps: ${error.message}`);
  return rows.length;
}

/**
 * Fallback when a manager didn't choose in time.
 *
 * The week rolls on Tuesday whether or not anyone opened the app, and a
 * missing keep would otherwise stall the next draft. Their best scorer
 * from the week is the least surprising default.
 */
export async function autoKeepBestScorer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  { seasonId, weekId, weekNumber, managerId }: {
    seasonId: string;
    weekId: string;
    weekNumber: number;
    managerId: string;
  },
): Promise<string | null> {
  const [{ data: scores }, { data: alreadyKept }] = await Promise.all([
    supabase
      .from("weekly_scores")
      .select("player_id, points")
      .eq("week_id", weekId)
      .eq("manager_id", managerId)
      .order("points", { ascending: false }),
    supabase
      .from("roster_keeps")
      .select("player_id")
      .eq("season_id", seasonId)
      .eq("manager_id", managerId)
      .is("released_after_week", null),
  ]);

  const held = new Set((alreadyKept ?? []).map((k) => k.player_id as string));
  const best = (scores ?? []).find((s) => !held.has(s.player_id as string));
  if (!best) return null;

  const { error } = await supabase.from("roster_keeps").insert({
    season_id: seasonId,
    manager_id: managerId,
    player_id: best.player_id,
    kept_after_week: weekNumber,
  });
  if (error) return null;
  return best.player_id as string;
}
