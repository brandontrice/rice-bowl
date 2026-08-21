import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSleeperState, fetchSleeperWeekStats } from "@/lib/sleeper";
import { computeWeeklyPoints } from "@/lib/scoring";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ weekId: string }> },
) {
  const { weekId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("*, seasons(year)")
    .eq("id", weekId)
    .single();
  if (weekError || !week) {
    return NextResponse.json({ error: "week not found" }, { status: 404 });
  }
  if (week.status === "drafting" || week.status === "upcoming") {
    return NextResponse.json({ error: "draft is not complete yet" }, { status: 409 });
  }

  const { data: picks, error: picksError } = await supabase
    .from("draft_picks")
    .select("*, players(*)")
    .eq("week_id", weekId);
  if (picksError) {
    return NextResponse.json({ error: picksError.message }, { status: 500 });
  }

  const seasonYear = (week as unknown as { seasons: { year: number } }).seasons.year;
  const stats = await fetchSleeperWeekStats(seasonYear, week.week_number);

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
      computed_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("weekly_scores")
      .upsert(rows, { onConflict: "week_id,manager_id,player_id" });
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
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
  const weekHasEnded =
    Number(state.season) > seasonYear ||
    (Number(state.season) === seasonYear && state.week > week.week_number);

  const update: Record<string, unknown> = {
    home_score: scoreA,
    away_score: scoreB,
  };
  if (weekHasEnded) {
    update.status = "complete";
    update.winner_manager_id = scoreA === scoreB ? null : scoreA > scoreB ? managerA : managerB;
  }

  const { error: weekUpdateError } = await supabase.from("weeks").update(update).eq("id", weekId);
  if (weekUpdateError) {
    return NextResponse.json({ error: weekUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scores: { [managerA]: scoreA, [managerB]: scoreB }, finalized: weekHasEnded });
}
