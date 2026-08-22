import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperState, fetchSleeperWeekStats } from "@/lib/sleeper";
import { computeWeeklyPoints } from "@/lib/scoring";
import { syncWeekStats, loadKnownPlayerIds } from "@/lib/player-stats";
import { syncSchedule } from "@/lib/nfl-schedule";

export type ScoreWeekResult = {
  skipped?: string;
  scores?: Record<string, number>;
  finalized?: boolean;
};

/**
 * Recomputes every rostered player's points for a week, applying the
 * week's House Rule, and finalises the week once Sleeper's state has moved
 * past it. Shared by the manual "Refresh scores" button and the cron job.
 */
export async function scoreWeek(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  weekId: string,
): Promise<ScoreWeekResult> {
  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("*, seasons(year)")
    .eq("id", weekId)
    .single();
  if (weekError || !week) throw new Error("week not found");

  if (week.status === "drafting" || week.status === "upcoming") {
    return { skipped: "draft is not complete yet" };
  }

  const { data: picks, error: picksError } = await supabase
    .from("draft_picks")
    .select("*, players(position)")
    .eq("week_id", weekId);
  if (picksError) throw new Error(picksError.message);

  const seasonYear = (week as unknown as { seasons: { year: number } }).seasons.year;
  const stats = await fetchSleeperWeekStats(seasonYear, week.week_number);

  // We already hold the whole league's stat lines for this week, so
  // persisting them costs a couple of batched upserts and is what keeps
  // the player pages' current-season numbers moving during games. Never
  // fatal: a matchup must still score if the stat archive hiccups.
  try {
    await syncWeekStats(
      supabase,
      seasonYear,
      week.week_number,
      await loadKnownPlayerIds(supabase),
      stats,
    );
  } catch (error) {
    console.error("player_week_stats upsert failed", error);
  }

  // Refresh just this week's games so the schedule view carries live
  // scores and statuses. One request; the daily sync owns the other
  // seventeen weeks.
  try {
    await syncSchedule(supabase, seasonYear, [week.week_number]);
  } catch (error) {
    console.error("nfl_games refresh failed", error);
  }

  const computedAt = new Date().toISOString();
  const rows = (picks ?? []).map((p) => {
    const player = p.players as { position: string | null } | null;
    const line = stats[p.player_id] ?? {};
    const breakdown = computeWeeklyPoints(player?.position ?? null, line, week.house_rule_key);
    return {
      week_id: weekId,
      manager_id: p.manager_id,
      player_id: p.player_id,
      roster_slot: p.roster_slot,
      raw_stats: line,
      points: breakdown.points,
      computed_at: computedAt,
    };
  });

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("weekly_scores")
      .upsert(rows, { onConflict: "week_id,manager_id,player_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const { data: managers } = await supabase
    .from("managers")
    .select("id")
    .order("created_at", { ascending: true });
  const [managerA, managerB] = (managers ?? []).map((m) => m.id);

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.manager_id, (totals.get(row.manager_id) ?? 0) + row.points);
  }
  const scoreA = totals.get(managerA) ?? 0;
  const scoreB = totals.get(managerB) ?? 0;

  const state = await fetchSleeperState();
  // A week is over once the regular season has moved past it, or the whole
  // season has. The season_type check is load-bearing: during the preseason
  // state.week reads 2, so without it Week 1 would be marked complete and a
  // Bowl Point awarded before a snap had been played.
  const weekHasEnded =
    Number(state.season) > seasonYear ||
    (Number(state.season) === seasonYear &&
      (state.season_type === "post" ||
        (state.season_type === "regular" && state.week > week.week_number)));

  const update: Record<string, unknown> = { home_score: scoreA, away_score: scoreB };
  if (weekHasEnded) {
    update.status = "complete";
    update.winner_manager_id = scoreA === scoreB ? null : scoreA > scoreB ? managerA : managerB;
  }

  const { error: weekUpdateError } = await supabase.from("weeks").update(update).eq("id", weekId);
  if (weekUpdateError) throw new Error(weekUpdateError.message);

  return { scores: { [managerA]: scoreA, [managerB]: scoreB }, finalized: weekHasEnded };
}
