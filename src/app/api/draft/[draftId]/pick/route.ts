import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rosterSlotDefs, assignSlot, poolRestriction } from "@/lib/draft";
import type { DraftPick, Week } from "@/types/database";

/**
 * Makes a pick.
 *
 * House Rule logic (which players are eligible, which slot a position may
 * fill) stays here in TypeScript, where the rules live. The state
 * transition — insert the pick, advance the clock, close the draft — is
 * handed to the `make_pick` Postgres function, which holds a row lock for
 * the duration. Previously this route did a read-modify-write on
 * `drafts.current_pick` across seven round-trips, so a replayed request
 * could advance the counter twice and skip a pick.
 */
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
  if (draftOrder[draft.current_pick] !== user.id) {
    return NextResponse.json({ error: "not your pick" }, { status: 403 });
  }

  const [{ data: week, error: weekError }, { data: player, error: playerError }] =
    await Promise.all([
      supabase.from("weeks").select("*").eq("id", draft.week_id).single<Week>(),
      supabase.from("players").select("*").eq("id", playerId).single(),
    ]);

  if (weekError || !week) {
    return NextResponse.json({ error: "week not found" }, { status: 404 });
  }
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

  const { data: myPicks } = await supabase
    .from("draft_picks")
    .select("roster_slot")
    .eq("draft_id", draftId)
    .eq("manager_id", user.id);

  const slot = assignSlot(
    player.position,
    (myPicks ?? []) as Pick<DraftPick, "roster_slot">[],
    rosterSlotDefs(week),
  );
  if (!slot) {
    return NextResponse.json({ error: "no open roster slot for this position" }, { status: 422 });
  }

  const { data: result, error: rpcError } = await supabase.rpc("make_pick", {
    p_draft_id: draftId,
    p_player_id: playerId,
    p_roster_slot: slot,
    p_expected_pick: draft.current_pick,
  });

  if (rpcError) {
    // P0001 is our own raise_exception — a rule violation the manager can
    // act on. Anything else is genuinely unexpected.
    const status = rpcError.code === "P0001" ? 409 : rpcError.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: rpcError.message }, { status });
  }

  return NextResponse.json(result);
}
