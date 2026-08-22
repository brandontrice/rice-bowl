import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentManager, getManagers, getBowlStandings } from "@/lib/data";
import { HouseRuleCard } from "@/components/HouseRuleCard";
import { DealtCard } from "@/components/DealtCard";
import { RuleReveal } from "@/components/RuleReveal";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { HeadToHead } from "@/components/HeadToHead";
import { RosterGrid } from "@/components/RosterGrid";
import { TrashTalkBoard } from "@/components/TrashTalkBoard";
import { BowlStandings } from "@/components/BowlStandings";
import { WagerLedger } from "@/components/WagerLedger";
import { RefreshScoresButton } from "@/components/RefreshScoresButton";
import { LiveScores } from "@/components/LiveScores";
import { KeepPanel, type KeepCandidate } from "@/components/KeepPanel";
import { EvictPanel, type Resident } from "@/components/EvictPanel";
import { Shell } from "@/components/ui/Shell";
import { getWeekTeamGames } from "@/lib/game-status";
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
    { data: reveals },
    { data: readyRows },
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
    supabase.from("week_reveals").select("manager_id").eq("week_id", weekId),
    draftRow
      ? supabase.from("draft_ready").select("manager_id").eq("draft_id", draftRow.id)
      : Promise.resolve({ data: [] }),
  ]);

  const idx = (siblingWeeks ?? []).findIndex((w) => w.id === weekId);
  const prevWeek = idx > 0 ? siblingWeeks![idx - 1] : null;
  const nextWeek = idx >= 0 && idx < (siblingWeeks?.length ?? 0) - 1 ? siblingWeeks![idx + 1] : null;

  // This week's game per team, so each roster row can say whether its
  // player is yet to play, on the field, or done.
  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("year")
    .eq("id", week.season_id)
    .maybeSingle();
  const teamGames = await getWeekTeamGames(
    supabase,
    seasonRow?.year ?? new Date().getUTCFullYear(),
    week.week_number,
  );

  const sniperManager = week.sniper_manager_id
    ? (managers.find((m) => m.id === week.sniper_manager_id) ?? null)
    : null;

  // A past week is history, not a surprise — only the current week's card
  // is worth withholding, and only from someone who hasn't turned it yet.
  const hasRevealed =
    week.status === "complete" ||
    !currentManager ||
    (reveals ?? []).some((r) => r.manager_id === currentManager.id);

  const readySet = new Set((readyRows ?? []).map((r) => r.manager_id as string));
  const iAmReady = Boolean(currentManager && readySet.has(currentManager.id));
  const notReady = managers.filter((m) => !readySet.has(m.id));

  const picks = (picksRaw ?? []) as (DraftPick & { players: Player | null })[];
  const scoreMap = new Map<string, number>();
  const totalsByManager = new Map<string, number>();
  for (const row of (scoreRows ?? []) as { player_id: string; manager_id: string; points: number }[]) {
    scoreMap.set(row.player_id, row.points);
    totalsByManager.set(row.manager_id, (totalsByManager.get(row.manager_id) ?? 0) + row.points);
  }
  const hasScores = (scoreRows ?? []).length > 0;

  // Keeps: after a finished week you claim one player for good, and once
  // all eight slots are yours the choice becomes an eviction instead.
  let keepView: {
    candidates: KeepCandidate[];
    chosen: KeepCandidate | null;
    keepsHeld: number;
    residents: Resident[];
    evicted: Resident | null;
  } | null = null;

  if (currentManager && week.status === "complete") {
    const nextWeek = week.week_number + 1;
    const [{ data: keepRows }, { data: heldNow }] = await Promise.all([
      supabase
        .from("roster_keeps")
        .select("player_id, kept_after_week, released_after_week")
        .eq("season_id", week.season_id)
        .eq("manager_id", currentManager.id),
      supabase.rpc("active_keeps", {
        p_season_id: week.season_id,
        p_manager_id: currentManager.id,
        p_for_week: nextWeek,
      }),
    ]);

    const held = new Set(
      ((heldNow ?? []) as { player_id: string }[]).map((r) => r.player_id),
    );
    const mine = picks.filter((p) => p.manager_id === currentManager.id);
    const toRow = (p: (typeof mine)[number]) => ({
      playerId: p.player_id,
      player: p.players,
      slot: p.roster_slot,
    });

    const keptThisWeek = (keepRows ?? []).find(
      (k) => k.kept_after_week === week.week_number && k.released_after_week === null,
    );
    const evictedThisWeek = (keepRows ?? []).find(
      (k) => k.released_after_week === week.week_number,
    );

    keepView = {
      keepsHeld: held.size,
      candidates: mine.map((p) => ({
        ...toRow(p),
        points: scoreMap.get(p.player_id) ?? null,
        alreadyKept: held.has(p.player_id) && p.player_id !== keptThisWeek?.player_id,
      })),
      chosen: keptThisWeek
        ? {
            ...(mine.find((p) => p.player_id === keptThisWeek.player_id)
              ? toRow(mine.find((p) => p.player_id === keptThisWeek.player_id)!)
              : { playerId: keptThisWeek.player_id, player: null, slot: "" }),
            points: scoreMap.get(keptThisWeek.player_id) ?? null,
            alreadyKept: true,
          }
        : null,
      residents: mine.filter((p) => held.has(p.player_id)).map(toRow),
      evicted: evictedThisWeek
        ? (mine.find((p) => p.player_id === evictedThisWeek.player_id)
            ? toRow(mine.find((p) => p.player_id === evictedThisWeek.player_id)!)
            : { playerId: evictedThisWeek.player_id, player: null, slot: "" })
        : null,
    };
  }

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
      <LiveScores weekId={weekId} live={!draftNotDone && week.status !== "complete"} />

      <nav className="flex items-center justify-between gap-3 text-xs">
        {prevWeek ? (
          <Link href={`/week/${prevWeek.id}`} className="font-data text-ink-dim hover:text-ink">
            ← Week {prevWeek.week_number}
          </Link>
        ) : (
          <span />
        )}
        <span className="flex flex-col items-center gap-0.5">
          <span className="font-display text-lg uppercase tracking-wide text-ink">
            Week {week.week_number}
          </span>
          {week.locks_at && (
            <KickoffCountdown locksAt={week.locks_at} drafted={!draftNotDone} />
          )}
        </span>
        {nextWeek ? (
          <Link href={`/week/${nextWeek.id}`} className="font-data text-ink-dim hover:text-ink">
            Week {nextWeek.week_number} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <RuleReveal
        weekId={weekId}
        weekNumber={week.week_number}
        revealed={hasRevealed}
      >
        <DealtCard weekId={weekId}>
          <HouseRuleCard week={week} sniperManager={sniperManager} />
        </DealtCard>
      </RuleReveal>

      {draftNotDone ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-seam p-10 text-center">
          <p className="text-sm text-ink-dim">
            {draftRow?.status === "active"
              ? "The draft is underway."
              : iAmReady
                ? `Waiting on ${notReady.map((m) => m.display_name).join(" and ")} to start.`
                : "Both managers have to start the draft before anyone can pick."}
          </p>

          {/* Who has started, visible without opening the draft room —
              otherwise the only way to know is to go and look. */}
          {draftRow?.status === "pending" && managers.length === 2 && (
            <div className="flex flex-wrap justify-center gap-2">
              {managers.map((m) => {
                const isReady = readySet.has(m.id);
                return (
                  <span
                    key={m.id}
                    className="flex items-center gap-2 rounded-full border px-3 py-1 font-data text-[10px] uppercase tracking-[0.1em]"
                    style={{
                      color: isReady ? m.accent_color : "var(--ink-faint)",
                      borderColor: isReady
                        ? `color-mix(in srgb, ${m.accent_color} 45%, transparent)`
                        : "var(--seam)",
                    }}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isReady ? "" : "animate-waiting"}`}
                      style={{ backgroundColor: isReady ? m.accent_color : "var(--ink-faint)" }}
                    />
                    {m.display_name} · {isReady ? "Ready" : "Not ready"}
                  </span>
                );
              })}
            </div>
          )}

          <Link
            href={`/week/${weekId}/draft`}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ground hover:opacity-90"
          >
            {/* Deliberately not "Start draft" — this only navigates. The
                lobby owns that action, and two buttons with one label
                reading differently is worse than one extra word here. */}
            {draftRow?.status === "active" ? "Rejoin the draft" : "Open the draft room"}
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
                games={teamGames}
              />
            ))}
          </div>
        </>
      )}

      {keepView && currentManager && (
        keepView.keepsHeld >= 8 ? (
          <EvictPanel
            seasonId={week.season_id}
            forWeek={week.week_number + 1}
            residents={keepView.residents}
            evicted={keepView.evicted}
          />
        ) : (
          <KeepPanel
            weekId={weekId}
            weekNumber={week.week_number}
            candidates={keepView.candidates}
            keepsHeld={keepView.keepsHeld}
            chosen={keepView.chosen}
          />
        )
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
