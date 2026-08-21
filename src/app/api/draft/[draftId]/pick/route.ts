import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rosterSlotDefs, assignSlot, poolRestriction, TOTAL_ROSTER_SIZE } from "@/lib/draft";
import type { DraftPick, Week } from "@/types/database";

export async function POST(
  request: Request,
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

  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
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

  const draftOrder = draft.draft_order as string[];
  const onTheClock = draftOrder[draft.current_pick];
  if (onTheClock !== user.id) {
    return NextResponse.json({ error: "not your pick" }, { status: 403 });
  }

  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", draft.week_id)
    .single<Week>();
  if (weekError || !week) {
    return NextResponse.json({ error: "week not found" }, { status: 404 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  }

  const restriction = poolRestriction(week);
  if (!restriction.isEligible(player)) {
    return NextResponse.json(
      { error: restriction.reason ?? "player is not eligible this week" },
      { status: 422 },
    );
  }

  const { data: alreadyTaken } = await supabase
    .from("draft_picks")
    .select("id")
    .eq("draft_id", draftId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (alreadyTaken) {
    return NextResponse.json({ error: "player already drafted" }, { status: 409 });
  }

  const { data: myPicks } = await supabase
    .from("draft_picks")
    .select("roster_slot")
    .eq("draft_id", draftId)
    .eq("manager_id", user.id);

  const slotDefs = rosterSlotDefs(week);
  const slot = assignSlot(player.position, (myPicks ?? []) as Pick<DraftPick, "roster_slot">[], slotDefs);
  if (!slot) {
    return NextResponse.json({ error: "no open roster slot for this position" }, { status: 422 });
  }

  const pickNumber = draft.current_pick + 1;
  const round = Math.floor(draft.current_pick / 2) + 1;

  const { error: insertError } = await supabase.from("draft_picks").insert({
    draft_id: draftId,
    week_id: draft.week_id,
    manager_id: user.id,
    player_id: playerId,
    pick_number: pickNumber,
    round,
    roster_slot: slot,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const nextPick = draft.current_pick + 1;
  const isComplete = nextPick >= draftOrder.length || nextPick >= TOTAL_ROSTER_SIZE * 2;

  const { error: updateError } = await supabase
    .from("drafts")
    .update({
      current_pick: nextPick,
      status: isComplete ? "complete" : "active",
    })
    .eq("id", draftId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (isComplete) {
    await supabase.from("weeks").update({ status: "scoring" }).eq("id", draft.week_id);
  }

  return NextResponse.json({ ok: true, slot, isComplete });
}
