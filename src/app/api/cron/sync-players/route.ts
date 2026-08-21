import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/service";
import { syncPlayers } from "@/lib/sync-players";

/** Vercel Cron: refresh the Sleeper player pool and its production ranking. */
export async function GET(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 });
  }

  try {
    const synced = await syncPlayers(createServiceClient());
    return NextResponse.json({ ok: true, synced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
