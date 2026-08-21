import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Arms the pick clock. Either manager may start it; it can't be stopped. */
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

  const { seconds } = (await request.json()) as { seconds?: number };
  if (!Number.isFinite(seconds)) {
    return NextResponse.json({ error: "seconds required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("arm_draft_clock", {
    p_draft_id: draftId,
    p_seconds: Math.round(seconds as number),
  });

  if (error) {
    const status = error.code === "P0001" ? 409 : error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
