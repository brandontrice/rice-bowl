import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreWeek } from "@/lib/score-week";

/** Manual "Refresh scores" from the matchup page. Cron uses /api/cron/score. */
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

  try {
    const result = await scoreWeek(supabase, weekId);
    if (result.skipped) {
      return NextResponse.json({ error: result.skipped }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "scoring failed";
    const status = message === "week not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
