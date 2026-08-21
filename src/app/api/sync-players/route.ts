import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncPlayers } from "@/lib/sync-players";

/** Manual player-pool resync. The scheduled one is /api/cron/sync-players. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ synced: await syncPlayers(supabase) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
