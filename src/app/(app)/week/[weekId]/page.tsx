import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentManager, getManagers, getBowlStandings } from "@/lib/data";
import { HouseRuleCard } from "@/components/HouseRuleCard";
import { RosterGrid } from "@/components/RosterGrid";
import { TrashTalkBoard } from "@/components/TrashTalkBoard";
import { BowlStandings } from "@/components/BowlStandings";
import { WagerLedger } from "@/components/WagerLedger";
import { RefreshScoresButton } from "@/components/RefreshScoresButton";
import type { DraftPick, Player, TrashTalk, Wager, Draft } from "@/types/database";

export default async function WeekPage({
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

  const draft = (week.drafts as Draft[] | Draft | null | undefined) as Draft | Draft[] | null;
  const draftRow: Draft | null = Array.isArray(draft) ? (draft[0] ?? null) : (draft ?? null);
  const draftNotDone = !draftRow || draftRow.status !== "complete";

  const [managers, currentManager, standings] = await Promise.all([
    getManagers(),
    getCurrentManager(),
    getBowlStandings(),
  ]);

  const { data: siblingWeeks } = await supabase
    .from("weeks")
    .select("id, week_number")
    .eq("season_id", week.season_id)
    .order("week_number", { ascending: true });
  const idx = (siblingWeeks ?? []).findIndex((w) => w.id === weekId);
  const prevWeek = idx > 0 ? siblingWeeks![idx - 1] : null;
  const nextWeek = idx >= 0 && idx < (siblingWeeks?.length ?? 0) - 1 ? siblingWeeks![idx + 1] : null;

  const { data: trashTalk } = await supabase.from("trash_talk").select("*").eq("week_id", weekId);
  const { data: wagers } = await supabase
    .from("wagers")
    .select("*")
    .eq("week_id", weekId)
    .order("created_at", { ascending: false });

  const sniperManager = week.sniper_manager_id
    ? (managers.find((m) => m.id === week.sniper_manager_id) ?? null)
    : null;

  let picks: (DraftPick & { players: Player | null })[] = [];
  const scoreMap = new Map<string, number>();
  const totalsByManager = new Map<string, number>();
  let hasScores = false;

  if (!draftNotDone) {
    const [{ data: picksRaw }, { data: scoreRows }] = await Promise.all([
      supabase.from("draft_picks").select("*, players(*)").eq("week_id", weekId),
      supabase.from("weekly_scores").select("*").eq("week_id", weekId),
    ]);
    picks = (picksRaw ?? []) as (DraftPick & { players: Player | null })[];
    for (const row of scoreRows ?? []) {
      scoreMap.set(row.player_id, row.points);
      totalsByManager.set(row.manager_id, (totalsByManager.get(row.manager_id) ?? 0) + row.points);
    }
    hasScores = (scoreRows ?? []).length > 0;
  }

  let leadingAccent: string | null = null;
  if (hasScores && managers.length === 2) {
    const [a, b] = managers;
    const scoreA = totalsByManager.get(a.id) ?? 0;
    const scoreB = totalsByManager.get(b.id) ?? 0;
    if (scoreA !== scoreB) leadingAccent = scoreA > scoreB ? a.accent_color : b.accent_color;
  }

  return (
    <div
      className="flex flex-col gap-6"
      style={leadingAccent ? ({ "--accent": leadingAccent } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center justify-between text-xs text-canvas-muted">
        {prevWeek ? (
          <Link href={`/week/${prevWeek.id}`} className="hover:text-canvas-fg">
            ← Week {prevWeek.week_number}
          </Link>
        ) : (
          <span />
        )}
        <span className="font-display text-lg uppercase tracking-wide text-canvas-fg">
          Week {week.week_number}
        </span>
        {nextWeek ? (
          <Link href={`/week/${nextWeek.id}`} className="hover:text-canvas-fg">
            Week {nextWeek.week_number} →
          </Link>
        ) : (
          <span />
        )}
      </div>

      <HouseRuleCard week={week} sniperManager={sniperManager} />

      {draftNotDone ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-canvas-border p-8 text-center">
          <p className="text-sm text-canvas-muted">
            {draftRow?.status === "active" ? "The draft is underway." : "The draft hasn't started yet."}
          </p>
          <Link
            href={`/week/${weekId}/draft`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {draftRow?.status === "active" ? "Rejoin the draft" : "Enter the draft room"}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {managers.map((m) => (
              <RosterGrid
                key={m.id}
                manager={m}
                picks={picks.filter((p) => p.manager_id === m.id)}
                scores={scoreMap}
                week={week}
                isMe={currentManager?.id === m.id}
                totalPoints={hasScores ? (totalsByManager.get(m.id) ?? 0) : null}
              />
            ))}
          </div>
          {week.status !== "complete" && (
            <div className="flex justify-end">
              <RefreshScoresButton weekId={weekId} />
            </div>
          )}
        </div>
      )}

      {currentManager && (
        <TrashTalkBoard
          weekId={weekId}
          managers={managers}
          currentManagerId={currentManager.id}
          initial={(trashTalk ?? []) as TrashTalk[]}
        />
      )}

      <BowlStandings managers={managers} standings={standings} />

      <WagerLedger weekId={weekId} managers={managers} initial={(wagers ?? []) as Wager[]} />
    </div>
  );
}
