import { createClient } from "@/lib/supabase/server";
import type { Manager, ManagerAllowlistEntry, Week, Draft } from "@/types/database";

export async function getCurrentManager(): Promise<Manager | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("managers").select("*").eq("id", user.id).maybeSingle();
  return data as Manager | null;
}

export async function getManagers(): Promise<Manager[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("managers").select("*").order("created_at", { ascending: true });
  return (data ?? []) as Manager[];
}

export async function getManagerAllowlist(): Promise<ManagerAllowlistEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("manager_allowlist")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as ManagerAllowlistEntry[];
}

export async function getLatestWeek(): Promise<(Week & { drafts: Draft[] }) | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weeks")
    .select("*, drafts(*)")
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as (Week & { drafts: Draft[] }) | null;
}

export async function getWeekById(weekId: string): Promise<(Week & { drafts: Draft[] }) | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("weeks").select("*, drafts(*)").eq("id", weekId).single();
  return data as (Week & { drafts: Draft[] }) | null;
}

export async function getBowlStandings(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("weeks").select("winner_manager_id").eq("status", "complete");
  const standings = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.winner_manager_id) continue;
    standings.set(row.winner_manager_id, (standings.get(row.winner_manager_id) ?? 0) + 1);
  }
  return standings;
}
