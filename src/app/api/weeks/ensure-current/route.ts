import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentWeek } from "@/lib/ensure-week";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureCurrentWeek(supabase);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ week: result.week });
}
