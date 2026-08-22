import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperState } from "@/lib/sleeper";
import { dealHouseRule } from "@/lib/house-rules";
import { mulberry32, seedFromWeek, pick as rngPick } from "@/lib/prng";
import { buildSnakeOrder, derivePoolLock } from "@/lib/draft";
import { fetchWeekKickoff } from "@/lib/schedule";
import type { Week, Draft } from "@/types/database";

export type EnsureWeekResult =
  | { week: Week & { drafts: Draft[] }; error?: undefined }
  | { week?: undefined; error: string };

/** Gets this NFL week's Rice Bowl matchup, dealing the House Rule and building the draft if it doesn't exist yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureCurrentWeek(supabase: SupabaseClient<any>): Promise<EnsureWeekResult> {
  const { data: managers, error: managersError } = await supabase
    .from("managers")
    .select("*")
    .order("created_at", { ascending: true });
  if (managersError) return { error: managersError.message };
  if (!managers || managers.length < 2) {
    return { error: "Both managers need to sign up before the league can start." };
  }

  const state = await fetchSleeperState();
  const seasonYear = Number(state.season);
  const weekNumber = Math.max(1, state.week);

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
    if (error) return { error: error.message };
    season = created;
  }

  const { data: existingWeek } = await supabase
    .from("weeks")
    .select("*, drafts(*)")
    .eq("season_id", season.id)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (existingWeek) {
    return { week: existingWeek };
  }

  const seed = seedFromWeek(seasonYear, weekNumber);
  const rng = mulberry32(seed);
  const houseRule = dealHouseRule(rng);
  const { locked_division, locked_conference } = derivePoolLock(houseRule.key, seed);

  const managerIds = managers.map((m) => m.id) as [string, string];
  const firstPicker = rngPick(rng, managerIds);
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
  if (weekError) return { error: weekError.message };

  const draftOrder = buildSnakeOrder(orderedIds);
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .insert({ week_id: week.id, status: "pending", draft_order: draftOrder, current_pick: 0 })
    .select("*")
    .single();
  if (draftError) return { error: draftError.message };

  return { week: { ...week, drafts: [draft] } };
}
