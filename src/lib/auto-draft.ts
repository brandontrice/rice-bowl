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

  // Ordered by average draft position: lowest ADP first, because ADP is
  // consensus draft order across Sleeper leagues and is the closest thing
  // to "who should go next" that exists. It is forward-looking, where
  // last season's points per game is not — the two disagree meaningfully
  // (McCaffrey is RB1 on 2025 production but 5th by ADP).
  //
  // Not every player has one, so the fallbacks matter: projection first,
  // then last season's production, then name for stability. Players with
  // no ADP sort behind every player who has one, which is correct — a
  // player nobody drafts in consensus should not go ahead of one who does.
  // Team defenses do carry an ADP and settle around pick 130 on their own,
  // which is where a real draft puts them.
  //
  // Deliberately not pos_rank: that is per position, so every position's
  // number one shares rank 1 and the top defense would outrank every RB2.
  const { data: playersRaw } = await supabase
    .from("players")
    .select("*")
    .in("position", FANTASY_POSITIONS)
    .order("adp", { ascending: true, nullsFirst: false })
    .order("proj_ppg", { ascending: false, nullsFirst: false })
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
