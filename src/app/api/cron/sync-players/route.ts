import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/service";
import { syncPlayers } from "@/lib/sync-players";

/**
 * Vercel Cron: refresh the Sleeper player pool and its production ranking.
 *
 * Declared long because it is: the pool, last season's totals, the ESPN id
 * backfill, projections and the full schedule land in one pass, around 35
 * seconds today and growing once in-season weeks start backfilling.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 401 });
  }

  try {
    const result = await syncPlayers(createServiceClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
