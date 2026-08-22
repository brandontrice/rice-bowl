import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperState } from "@/lib/sleeper";
import { dealHouseRule } from "@/lib/house-rules";
import { mulberry32, seedFromWeek, pick as rngPick } from "@/lib/prng";
import { buildSnakeOrder, derivePoolLock, TOTAL_ROSTER_SIZE } from "@/lib/draft";
import { activeKeeps, autoKeepBestScorer, expectedKeeps, materializeKeeps } from "@/lib/keeps";
import { fetchWeekKickoff } from "@/lib/schedule";
import { REGULAR_SEASON_WEEKS } from "@/lib/nfl-schedule";
import type { Week, Draft } from "@/types/database";

export type EnsureWeekResult =
  | { status: "ready"; week: Week & { drafts: Draft[] } }
  | { status: "not-started"; season: number; seasonType: string }
  | { status: "error"; error: string };

/**
 * Gets this NFL week's matchup, dealing the House Rule and building the
 * draft if it doesn't exist yet.
 *
 * The league plays weeks 1 through 18. During the preseason the upcoming
 * week is Week 1, so its card is dealt and its draft is ready well before
 * the opener — the draft itself is gated on both managers being ready, not
 * on the calendar. After the regular season there is nothing left to deal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureCurrentWeek(supabase: SupabaseClient<any>): Promise<EnsureWeekResult> {
  const { data: managers, error: managersError } = await supabase
    .from("managers")
    .select("*")
    .order("created_at", { ascending: true });
  if (managersError) return { status: "error", error: managersError.message };
  if (!managers || managers.length < 2) {
    return {
      status: "error",
      error: "Both managers need to sign up before the league can start.",
    };
  }

  const state = await fetchSleeperState();
  const seasonYear = Number(state.season);

  // Once the regular season is over there is nothing left to deal.
  if (state.season_type === "post") {
    return { status: "not-started", season: seasonYear, seasonType: state.season_type };
  }

  // During the preseason the *upcoming* week is Week 1, so the card is
  // dealt and the draft is ready well before the opener. What is not done
  // is read state.week directly: it counts preseason weeks, so in August
  // it reads 2 and would have created a competitive "Week 2", skipping
  // Week 1 and settling the rivalry on exhibition football.
  const weekNumber =
    state.season_type === "regular"
      ? Math.min(REGULAR_SEASON_WEEKS, Math.max(1, state.week))
      : 1;

  let { data: season } = await supabase
    .from("seasons")
    .select("*")
    .eq("year", seasonYear)
    .maybeSingle();

  if (!season) {
    const { data: created, error } = await supabase
      .from("seasons")
      .insert({ year: seasonYear, name: `${seasonYear} Season` })
      .select("*")
      .single();
    if (error) return { status: "error", error: error.message };
    season = created;
  }

  const { data: existingWeek } = await supabase
    .from("weeks")
    .select("*, drafts(*)")
    .eq("season_id", season.id)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (existingWeek) {
    return { status: "ready", week: existingWeek };
  }

  const seed = seedFromWeek(seasonYear, weekNumber);
  const rng = mulberry32(seed);
  const houseRule = dealHouseRule(rng);
  const { locked_division, locked_conference } = derivePoolLock(houseRule.key, seed);

  const managerIds = managers.map((m) => m.id) as [string, string];

  // Everyone should be carrying one keep per completed week. If a manager
  // never chose, take their best scorer — the week rolls on Tuesday whether
  // or not anyone opened the app, and a missing keep would stall the draft.
  if (weekNumber > 1) {
    const { data: lastWeek } = await supabase
      .from("weeks")
      .select("id, week_number, winner_manager_id")
      .eq("season_id", season.id)
      .eq("week_number", weekNumber - 1)
      .eq("status", "complete")
      .maybeSingle();

    if (lastWeek) {
      for (const managerId of managerIds) {
        const held = await activeKeeps(supabase, season.id, managerId, weekNumber);
        if (held.length < expectedKeeps(weekNumber)) {
          await autoKeepBestScorer(supabase, {
            seasonId: season.id,
            weekId: lastWeek.id,
            weekNumber: lastWeek.week_number,
            managerId,
          });
        }
      }
    }
  }

  const keepsByManager = new Map<string, string[]>();
  for (const managerId of managerIds) {
    keepsByManager.set(managerId, await activeKeeps(supabase, season.id, managerId, weekNumber));
  }

  // Rounds left is whatever the keeps didn't already fill. At Full House
  // that's zero until somebody evicts.
  const rounds = Math.max(
    0,
    TOTAL_ROSTER_SIZE - Math.max(...managerIds.map((id) => keepsByManager.get(id)?.length ?? 0)),
  );

  // Last week's loser picks first. Without it the manager who is already
  // ahead compounds the advantage every week for the rest of the season.
  const { data: previous } = await supabase
    .from("weeks")
    .select("winner_manager_id, status")
    .eq("season_id", season.id)
    .eq("week_number", weekNumber - 1)
    .maybeSingle();

  const loser =
    previous?.status === "complete" && previous.winner_manager_id
      ? managerIds.find((id) => id !== previous.winner_manager_id)
      : null;

  const firstPicker = loser ?? rngPick(rng, managerIds);
  const orderedIds: [string, string] =
    firstPicker === managerIds[0] ? managerIds : [managerIds[1], managerIds[0]];
  const sniperManagerId = houseRule.key === "sniper" ? rngPick(rng, managerIds) : null;
  const flexPosition = houseRule.key === "flex_flip" ? "WR" : null;

  // The draft deadline is the week's first kickoff, looked up once when
  // the week is created. Null is fine — the UI simply omits the countdown
  // rather than inventing a Thursday that might be wrong.
  const locksAt = await fetchWeekKickoff(seasonYear, weekNumber);

  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .insert({
      season_id: season.id,
      week_number: weekNumber,
      locks_at: locksAt,
      house_rule_key: houseRule.key,
      house_rule_seed: seed,
      status: "drafting",
      sniper_manager_id: sniperManagerId,
      locked_division,
      locked_conference,
      flex_position: flexPosition,
    })
    .select("*")
    .single();
  if (weekError) return { status: "error", error: weekError.message };

  const draftOrder = buildSnakeOrder(orderedIds, rounds);
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .insert({
      week_id: week.id,
      // Nothing to draft means nothing to wait for: a Full House week with
      // no eviction is complete the moment it is created.
      status: rounds === 0 ? "complete" : "pending",
      draft_order: draftOrder,
      current_pick: 0,
    })
    .select("*")
    .single();
  if (draftError) return { status: "error", error: draftError.message };

  // Carry the residents in as picks that were already made.
  for (const managerId of managerIds) {
    await materializeKeeps(supabase, {
      draftId: draft.id,
      weekId: week.id,
      managerId,
      playerIds: keepsByManager.get(managerId) ?? [],
    });
  }

  if (rounds === 0) {
    await supabase.from("weeks").update({ status: "scoring" }).eq("id", week.id);
  }

  return { status: "ready", week: { ...week, drafts: [draft] } };
}
