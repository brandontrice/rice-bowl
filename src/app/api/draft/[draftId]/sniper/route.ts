import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { round } = (await request.json()) as { round?: number };
  if (!round || round < 1 || round > 8) {
    return NextResponse.json({ error: "round must be 1-8" }, { status: 400 });
  }

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("*")
    .eq("id", draftId)
    .single();
  if (draftError || !draft) {
    return NextResponse.json({ error: "draft not found" }, { status: 404 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json(
      { error: "the snipe must be used before the draft starts" },
      { status: 409 },
    );
  }

  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", draft.week_id)
    .single();
  if (weekError || !week) {
    return NextResponse.json({ error: "week not found" }, { status: 404 });
  }
  if (week.house_rule_key !== "sniper") {
    return NextResponse.json({ error: "sniper is not this week's house rule" }, { status: 409 });
  }
  if (week.sniper_manager_id !== user.id) {
    return NextResponse.json({ error: "only the sniper can steal a pick" }, { status: 403 });
  }
  if (week.sniper_used) {
    return NextResponse.json({ error: "the snipe has already been used" }, { status: 409 });
  }

  const order = [...(draft.draft_order as string[])];
  const first = (round - 1) * 2;
  const second = first + 1;
  if (order[first] === user.id) {
    return NextResponse.json(
      { error: "you already pick first in that round" },
      { status: 409 },
    );
  }
  [order[first], order[second]] = [order[second], order[first]];

  const { error: draftUpdateError } = await supabase
    .from("drafts")
    .update({ draft_order: order })
    .eq("id", draftId);
  if (draftUpdateError) {
    return NextResponse.json({ error: draftUpdateError.message }, { status: 500 });
  }

  const { error: weekUpdateError } = await supabase
    .from("weeks")
    .update({ sniper_used: true })
    .eq("id", week.id);
  if (weekUpdateError) {
    return NextResponse.json({ error: weekUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft_order: order });
}
