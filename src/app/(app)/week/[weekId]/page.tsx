import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentManager, getManagers, getBowlStandings } from "@/lib/data";
import { HouseRuleCard } from "@/components/HouseRuleCard";
import { DealtCard } from "@/components/DealtCard";
import { HeadToHead } from "@/components/HeadToHead";
import { RosterGrid } from "@/components/RosterGrid";
import { TrashTalkBoard } from "@/components/TrashTalkBoard";
import { BowlStandings } from "@/components/BowlStandings";
import { WagerLedger } from "@/components/WagerLedger";
import { RefreshScoresButton } from "@/components/RefreshScoresButton";
import { LiveScores } from "@/components/LiveScores";
import { Shell } from "@/components/ui/Shell";
import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import type { DraftPick, Player, TrashTalk, Wager, Draft } from "@/types/database";

export default async function WeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const supabase = await createClient();

  const { data: week } = await supabase
    .from("weeks")
    .select("*, drafts(*)")
    .eq("id", weekId)
    .single();
  if (!week) notFound();

  const draft = week.drafts as Draft[] | Draft | null | undefined;
  const draftRow: Draft | null = Array.isArray(draft) ? (draft[0] ?? null) : (draft ?? null);
  const draftNotDone = !draftRow || draftRow.status !== "complete";

  // Everything below depends only on the week we just loaded, so it all goes
  // out at once. This page used to await seven queries in sequence before it
  // rendered a single pixel.
  const [
    managers,
    currentManager,
    standings,
    { data: siblingWeeks },
    { data: trashTalk },
    { data: wagers },
    { data: picksRaw },
    { data: scoreRows },
  ] = await Promise.all([
    getManagers(),
    getCurrentManager(),
    getBowlStandings(),
    supabase
      .from("weeks")
      .select("id, week_number")
      .eq("season_id", week.season_id)
      .order("week_number", { ascending: true }),
    supabase.from("trash_talk").select("*").eq("week_id", weekId),
    supabase
      .from("wagers")
      .select("*")
      .eq("week_id", weekId)
      .order("created_at", { ascending: false }),
    draftNotDone
      ? Promise.resolve({ data: [] })
      : supabase.from("draft_picks").select("*, players(*)").eq("week_id", weekId),
    draftNotDone
      ? Promise.resolve({ data: [] })
      : supabase.from("weekly_scores").select("*").eq("week_id", weekId),
  ]);

  const idx = (siblingWeeks ?? []).findIndex((w) => w.id === weekId);
  const prevWeek = idx > 0 ? siblingWeeks![idx - 1] : null;
  const nextWeek = idx >= 0 && idx < (siblingWeeks?.length ?? 0) - 1 ? siblingWeeks![idx + 1] : null;

  const sniperManager = week.sniper_manager_id
    ? (managers.find((m) => m.id === week.sniper_manager_id) ?? null)
    : null;

  const picks = (picksRaw ?? []) as (DraftPick & { players: Player | null })[];
  const scoreMap = new Map<string, number>();
  const totalsByManager = new Map<string, number>();
  for (const row of (scoreRows ?? []) as { player_id: string; manager_id: string; points: number }[]) {
    scoreMap.set(row.player_id, row.points);
    totalsByManager.set(row.manager_id, (totalsByManager.get(row.manager_id) ?? 0) + row.points);
  }
  const hasScores = (scoreRows ?? []).length > 0;

  // The action colour follows whoever is ahead, so the page picks up the
  // rivalry rather than staying a fixed brand orange.
  let leadingAccent: string | null = null;
  if (hasScores && managers.length === 2) {
    const [a, b] = managers;
    const scoreA = totalsByManager.get(a.id) ?? 0;
    const scoreB = totalsByManager.get(b.id) ?? 0;
    if (scoreA !== scoreB) leadingAccent = scoreA > scoreB ? a.accent_color : b.accent_color;
  }

  const [a, b] = managers;
  const margin =
    hasScores && a && b
      ? Math.abs((totalsByManager.get(a.id) ?? 0) - (totalsByManager.get(b.id) ?? 0))
      : null;
  const leaderName =
    leadingAccent && a && b
      ? (totalsByManager.get(a.id) ?? 0) > (totalsByManager.get(b.id) ?? 0)
        ? a.display_name
        : b.display_name
      : null;

  return (
    <Shell
      style={leadingAccent ? ({ "--accent": leadingAccent } as React.CSSProperties) : undefined}
    >
      <LiveScores weekId={weekId} />

      <nav className="flex items-center justify-between gap-3 text-xs">
        {prevWeek ? (
          <Link href={`/week/${prevWeek.id}`} className="font-data text-ink-dim hover:text-ink">
            ← Week {prevWeek.week_number}
          </Link>
        ) : (
          <span />
        )}
        <span className="font-display text-lg uppercase tracking-wide text-ink">
          Week {week.week_number}
        </span>
        {nextWeek ? (
          <Link href={`/week/${nextWeek.id}`} className="font-data text-ink-dim hover:text-ink">
            Week {nextWeek.week_number} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <DealtCard weekId={weekId}>
        <HouseRuleCard week={week} sniperManager={sniperManager} />
      </DealtCard>

      {draftNotDone ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-seam p-10 text-center">
          <p className="text-sm text-ink-dim">
            {draftRow?.status === "active"
              ? "The draft is underway."
              : "The draft hasn't started yet."}
          </p>
          <Link
            href={`/week/${weekId}/draft`}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ground hover:opacity-90"
          >
            {draftRow?.status === "active" ? "Rejoin the draft" : "Enter the draft room"}
          </Link>
        </div>
      ) : (
        <>
          {managers.length === 2 && (
            <HeadToHead
              managers={managers}
              values={totalsByManager}
              unit="Points"
              footNote={
                <>
                  <span>
                    {!hasScores
                      ? "No stats yet — Sleeper posts them after games finish."
                      : margin === 0
                        ? "Dead level."
                        : (
                            <>
                              {leaderName} leads by{" "}
                              <strong className="font-semibold text-ink">
                                {margin?.toFixed(1)}
                              </strong>
                            </>
                          )}
                  </span>
                  {week.status !== "complete" && <RefreshScoresButton weekId={weekId} />}
                </>
              }
            />
          )}

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
        </>
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
    </Shell>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ weekId: string }>;
}): Promise<Metadata> {
  const { weekId } = await params;
  const supabase = await createClient();
  const { data: week } = await supabase
    .from("weeks")
    .select("week_number, house_rule_key")
    .eq("id", weekId)
    .maybeSingle();

  if (!week) return { title: "Week" };
  const rule = HOUSE_RULE_BY_KEY[week.house_rule_key];
  return {
    title: `Week ${week.week_number}`,
    description: rule ? `${rule.name} — ${rule.tagline}` : undefined,
  };
}
