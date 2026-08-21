import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickBestAvailable } from "@/lib/auto-draft";
import type { Week } from "@/types/database";

/**
 * Commits the auto-pick when a deadline passes.
 *
 * Either manager's browser may call this — often the opponent's tab is the
 * only one still open. The deadline is the authorisation: `auto_pick()`
 * refuses while time remains, so this cannot be used to force someone's
 * pick early. If both tabs race the same expiry, one wins and the other
 * gets a 409, which is not worth surfacing.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("*")
    .eq("id", draftId)
    .single();
  if (draftError || !draft) {
    return NextResponse.json({ error: "draft not found" }, { status: 404 });
  }
  if (draft.status === "complete") {
    return NextResponse.json({ error: "draft is already complete" }, { status: 409 });
  }
  if (!draft.deadline_at) {
    return NextResponse.json({ error: "the clock is not running" }, { status: 409 });
  }
  // Cheap pre-check so an early call costs one query instead of a full
  // pool scan; auto_pick() re-checks this under a lock regardless.
  if (Date.now() < new Date(draft.deadline_at).getTime() - 1000) {
    return NextResponse.json({ error: "there is still time on the clock" }, { status: 409 });
  }

  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", draft.week_id)
    .single<Week>();
  if (weekError || !week) {
    return NextResponse.json({ error: "week not found" }, { status: 404 });
  }

  const onTheClock = (draft.draft_order as string[])[draft.current_pick];
  if (!onTheClock) {
    return NextResponse.json({ error: "nobody is on the clock" }, { status: 409 });
  }

  const choice = await pickBestAvailable(supabase, week, draftId, onTheClock);
  if (!choice) {
    return NextResponse.json(
      { error: "no eligible player is left for an open slot" },
      { status: 422 },
    );
  }

  const { data: result, error: rpcError } = await supabase.rpc("auto_pick", {
    p_draft_id: draftId,
    p_player_id: choice.player.id,
    p_roster_slot: choice.slot,
  });

  if (rpcError) {
    const status = rpcError.code === "P0001" ? 409 : rpcError.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: rpcError.message }, { status });
  }

  return NextResponse.json({ ...result, playerName: choice.player.full_name });
}
