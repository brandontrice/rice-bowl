import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentManager, getManagers } from "@/lib/data";
import { poolRestriction } from "@/lib/draft";
import { after } from "next/server";
import { isPlayerPoolStale, syncPlayers } from "@/lib/sync-players";
import { createServiceClient } from "@/lib/supabase/service";
import { DraftRoom } from "@/components/DraftRoom";
import { Shell } from "@/components/ui/Shell";
import type { Player, Draft, DraftPick } from "@/types/database";

const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "DEF"];

export default async function DraftPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  const { weekId } = await params;
  const supabase = await createClient();

  const { data: week } = await supabase
    .from("weeks")
    .select("*, drafts(*)")
    .eq("id", weekId)
    .single();
  if (!week) notFound();

  const draftRow = (
    Array.isArray(week.drafts) ? week.drafts[0] : week.drafts
  ) as Draft | undefined;
  if (!draftRow) notFound();
  if (draftRow.status === "complete") redirect(`/week/${weekId}`);

  const currentManager = await getCurrentManager();
  if (!currentManager) redirect("/login");

  const managers = await getManagers();

  // Never block the render on this. A stale cache means a multi-megabyte
  // Sleeper fetch plus ~20 upsert batches; the manager opening the draft
  // room would sit on a blank screen for all of it. Cron keeps the pool
  // fresh — this is the safety net, and it runs after the response.
  if (await isPlayerPoolStale(supabase)) {
    after(async () => {
      try {
        await syncPlayers(createServiceClient());
      } catch (error) {
        console.error("background player sync failed", error);
      }
    });
  }

  const { data: playersRaw } = await supabase
    .from("players")
    .select("*")
    .in("position", FANTASY_POSITIONS)
    .order("pos_rank", { ascending: true, nullsFirst: false })
    .order("full_name", { ascending: true });

  const restriction = poolRestriction(week);
  const players = ((playersRaw ?? []) as Player[]).filter(restriction.isEligible);

  const { data: picks } = await supabase
    .from("draft_picks")
    .select("*, players(*)")
    .eq("draft_id", draftRow.id)
    .order("pick_number", { ascending: true });

  return (
    <Shell width="wide">
      <DraftRoom
        week={week}
        draft={draftRow}
        managers={managers}
        currentManagerId={currentManager.id}
        players={players}
        initialPicks={(picks ?? []) as (DraftPick & { players: Player | null })[]}
        poolRestrictionReason={restriction.reason}
      />
    </Shell>
  );
}
