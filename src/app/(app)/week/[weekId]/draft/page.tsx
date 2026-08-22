import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentManager, getManagers } from "@/lib/data";
import { poolRestriction } from "@/lib/draft";
import { after } from "next/server";
import { isPlayerPoolStale, syncPlayers } from "@/lib/sync-players";
import { createServiceClient } from "@/lib/supabase/service";
import { DraftRoom } from "@/components/DraftRoom";
import { Shell } from "@/components/ui/Shell";
import { getWeekTeamGames } from "@/lib/game-status";
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

  // You draft under the rule, so you see the rule first. Without this the
  // reveal is skippable by going straight to the draft room, which also
  // spoils it — the House Rule is printed at the top of this page.
  const { data: reveal } = await supabase
    .from("week_reveals")
    .select("manager_id")
    .eq("week_id", weekId)
    .eq("manager_id", currentManager.id)
    .maybeSingle();
  if (!reveal) redirect(`/week/${weekId}`);

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

  // Same order the auto-draft uses — see pickBestAvailable(). "Best
  // available" has to mean one thing: if the board ranked players
  // differently from what the clock takes when it runs out, the tab would
  // be lying about what happens next.
  const { data: playersRaw } = await supabase
    .from("players")
    .select("*")
    .in("position", FANTASY_POSITIONS)
    .order("adp", { ascending: true, nullsFirst: false })
    .order("proj_ppg", { ascending: false, nullsFirst: false })
    .order("ppg", { ascending: false, nullsFirst: false })
    .order("full_name", { ascending: true });

  const restriction = poolRestriction(week);
  const players = ((playersRaw ?? []) as Player[]).filter(restriction.isEligible);

  // Which teams have already kicked off. Their players are shown but not
  // draftable — hiding them outright would leave a manager wondering where
  // a name went, and "locked" is the more useful answer.
  const { data: season } = await supabase
    .from("seasons")
    .select("year")
    .eq("id", week.season_id)
    .maybeSingle();
  const teamGames = await getWeekTeamGames(
    supabase,
    season?.year ?? new Date().getUTCFullYear(),
    week.week_number,
  );
  const lockedTeams = [...teamGames.values()].filter((g) => g.locked).map((g) => g.team);

  const { data: readyRows } = await supabase
    .from("draft_ready")
    .select("manager_id")
    .eq("draft_id", draftRow.id);

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
        lockedTeams={lockedTeams}
        initialReady={(readyRows ?? []).map((r) => r.manager_id as string)}
      />
    </Shell>
  );
}
