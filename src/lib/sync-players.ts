import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSleeperPlayerPool } from "@/lib/sleeper";

const STALE_MS = 12 * 60 * 60 * 1000; // Sleeper's dump barely moves intra-day; once/12h is plenty.

/** Refreshes the cached Sleeper player pool if it's empty or stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePlayersSynced(supabase: SupabaseClient<any>): Promise<void> {
  const { data: latest } = await supabase
    .from("players")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale = !latest || Date.now() - new Date(latest.updated_at).getTime() > STALE_MS;
  if (!isStale) return;

  const players = await fetchSleeperPlayerPool();
  const BATCH = 500;
  for (let i = 0; i < players.length; i += BATCH) {
    await supabase.from("players").upsert(players.slice(i, i + BATCH), { onConflict: "id" });
  }
}
