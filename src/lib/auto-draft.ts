import type { SupabaseClient } from "@supabase/supabase-js";
import { rosterSlotDefs, assignSlot, poolRestriction } from "@/lib/draft";
import type { DraftPick, Player, Week } from "@/types/database";

const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "DEF"];

export type AutoDraftChoice = { player: Player; slot: string };

/**
 * The player the clock hands to a manager who ran out of time: the
 * highest-ranked one who is still available, allowed by the week's House
 * Rule, and able to fill a slot they have not filled yet.
 *
 * Rank is `pos_rank` — points per game within position — so "top ranked"
 * means best at a position they actually still need, not best overall at a
 * position they have already filled twice.
 */
export async function pickBestAvailable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  week: Week,
  draftId: string,
  managerId: string,
): Promise<AutoDraftChoice | null> {
  const [{ data: takenRows }, { data: myPicks }] = await Promise.all([
    supabase.from("draft_picks").select("player_id").eq("draft_id", draftId),
    supabase
      .from("draft_picks")
      .select("roster_slot")
      .eq("draft_id", draftId)
      .eq("manager_id", managerId),
  ]);

  const taken = new Set((takenRows ?? []).map((r) => r.player_id as string));
  const slotDefs = rosterSlotDefs(week);
  const restriction = poolRestriction(week);

  // Ordered by points per game, NOT pos_rank. pos_rank is per position, so
  // every position's number one shares rank 1 — ordering by it would put
  // the top defense (~10 ppg) ahead of every RB2 and WR2 on the board.
  // Unranked players sort last, which is right: those are the ones Sleeper
  // has no production for.
  const { data: playersRaw } = await supabase
    .from("players")
    .select("*")
    .in("position", FANTASY_POSITIONS)
    .order("ppg", { ascending: false, nullsFirst: false })
    .order("full_name", { ascending: true });

  for (const player of (playersRaw ?? []) as Player[]) {
    if (taken.has(player.id)) continue;
    if (!restriction.isEligible(player)) continue;
    const slot = assignSlot(
      player.position,
      (myPicks ?? []) as Pick<DraftPick, "roster_slot">[],
      slotDefs,
    );
    if (slot) return { player, slot };
  }

  return null;
}
