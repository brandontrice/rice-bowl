import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSleeperPlayerPool } from "@/lib/sleeper";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const players = await fetchSleeperPlayerPool();

  const BATCH = 500;
  for (let i = 0; i < players.length; i += BATCH) {
    const batch = players.slice(i, i + BATCH);
    const { error } = await supabase.from("players").upsert(batch, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ synced: players.length });
}
