import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/service";
import { scoreWeek } from "@/lib/score-week";
import { ensureCurrentWeek } from "@/lib/ensure-week";

/**
 * Vercel Cron: rescore every week that isn't finished yet.
 *
 * Scores used to move only when a manager remembered to press "Refresh
 * scores", which also meant a week was finalised whenever someone happened
 * to visit rather than when it actually ended.
 */
export async function GET(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Deal the new week before scoring the old one. Sleeper's state.week
  // rolls on Tuesday; doing this here means the card is face down and
  // waiting whenever the managers next open the app, rather than being
  // created by whoever happens to visit first.
  const dealt = await ensureCurrentWeek(supabase).catch(
    (err): { status: "error"; error: string } => ({
      status: "error",
      error: err instanceof Error ? err.message : "deal failed",
    }),
  );

  const { data: weeks, error } = await supabase
    .from("weeks")
    .select("id")
    .in("status", ["scoring", "drafting"]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const week of weeks ?? []) {
    try {
      results.push({ weekId: week.id, ...(await scoreWeek(supabase, week.id)) });
    } catch (err) {
      results.push({
        weekId: week.id,
        error: err instanceof Error ? err.message : "scoring failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dealt:
      dealt.status === "ready"
        ? dealt.week.week_number
        : dealt.status === "not-started"
          ? `not started ()`
          : dealt.error,
    scored: results,
  });
}
