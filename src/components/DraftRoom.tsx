"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rosterSlotDefs, hasOpenSlotFor, TOTAL_ROSTER_SIZE } from "@/lib/draft";
import { positionColor } from "@/lib/rule-style";
import { HouseRuleCard } from "@/components/HouseRuleCard";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PickClock } from "@/components/PickClock";
import type { Draft, DraftPick, Manager, Player, Week } from "@/types/database";

type PickWithPlayer = DraftPick & { players: Player | null };

const POSITION_TABS = ["ALL", "QB", "RB", "WR", "TE", "DEF"] as const;
const POOL_LIMIT = 150;

export function DraftRoom({
  week,
  draft: initialDraft,
  managers,
  currentManagerId,
  players,
  initialPicks,
  poolRestrictionReason,
}: {
  week: Week;
  draft: Draft;
  managers: Manager[];
  currentManagerId: string;
  players: Player[];
  initialPicks: PickWithPlayer[];
  poolRestrictionReason: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [picks, setPicks] = useState<PickWithPlayer[]>(initialPicks);
  const [search, setSearch] = useState("");
  const [positionTab, setPositionTab] = useState<(typeof POSITION_TABS)[number]>("ALL");
  const [onlyFillable, setOnlyFillable] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sniperRound, setSniperRound] = useState(1);
  const [sniping, setSniping] = useState(false);
  const [justLanded, setJustLanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const managerById = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`draft-${draft.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_picks", filter: `draft_id=eq.${draft.id}` },
        (payload) => {
          const row = payload.new as DraftPick;
          setPicks((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [...prev, { ...row, players: playerById.get(row.player_id) ?? null }].sort(
              (a, b) => a.pick_number - b.pick_number,
            );
          });
          // A pick used to appear with no acknowledgement at all. Flag it so
          // the roster row plays its landing animation once.
          setJustLanded(row.id);
          window.setTimeout(() => setJustLanded((id) => (id === row.id ? null : id)), 1400);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drafts", filter: `id=eq.${draft.id}` },
        (payload) => {
          const row = payload.new as Draft;
          setDraft(row);
          if (row.status === "complete") router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  const onTheClock = draft.draft_order[draft.current_pick] as string | undefined;
  const isMyTurn = onTheClock === currentManagerId && draft.status !== "complete";
  const currentRound = Math.floor(draft.current_pick / 2) + 1;
  const isBlind = week.house_rule_key === "blind_draft" && draft.status !== "complete";

  const myPicks = picks.filter((p) => p.manager_id === currentManagerId);
  const opponent = managers.find((m) => m.id !== currentManagerId) ?? null;
  const opponentPicks = opponent ? picks.filter((p) => p.manager_id === opponent.id) : [];

  const slotDefs = rosterSlotDefs(week);
  const pickedIds = new Set(picks.map((p) => p.player_id));
  const term = search.trim().toLowerCase();

  // The pool arrives pre-sorted by average draft position from the server,
  // matching what the clock takes on an expiry. It used to be alphabetical,
  // which made finding the best available player mid-draft impossible.
  const filtered = players
    .filter((p) => !pickedIds.has(p.id))
    .filter((p) => positionTab === "ALL" || p.position === positionTab)
    .filter((p) => (term ? p.full_name.toLowerCase().includes(term) : true))
    .filter((p) => (onlyFillable ? hasOpenSlotFor(p.position, myPicks, slotDefs) : true))
    .slice(0, POOL_LIMIT);

  async function handlePick(playerId: string) {
    setPending(playerId);
    setError(null);
    const res = await fetch(`/api/draft/${draft.id}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const body = await res.json();
    setPending(null);
    if (!res.ok) {
      setError(body.error ?? "Pick failed");
      return;
    }
    if (body.isComplete) router.refresh();
  }

  async function handleSnipe() {
    setSniping(true);
    setError(null);
    const res = await fetch(`/api/draft/${draft.id}/sniper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: sniperRound }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Snipe failed");
      setSniping(false);
      return;
    }
    setDraft((prev) => ({ ...prev, draft_order: body.draft_order }));
    router.refresh();
    setSniping(false);
  }

  const canSnipe =
    week.house_rule_key === "sniper" &&
    !week.sniper_used &&
    week.sniper_manager_id === currentManagerId &&
    draft.status === "pending";

  return (
    <>
      <HouseRuleCard
        week={week}
        sniperManager={week.sniper_manager_id ? (managerById.get(week.sniper_manager_id) ?? null) : null}
        compact
      />

      {canSnipe && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm font-semibold text-ink">You&apos;re the Sniper.</p>
          <p className="mt-1 text-xs text-ink-dim">
            Steal the first pick of one round from your opponent, before the draft starts.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={sniperRound}
              onChange={(e) => setSniperRound(Number(e.target.value))}
              className="rounded-lg border border-seam bg-ground px-2 py-1.5 text-sm text-ink"
            >
              {Array.from({ length: TOTAL_ROSTER_SIZE }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  Round {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSnipe}
              disabled={sniping}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ground hover:opacity-90 disabled:opacity-50"
            >
              {sniping ? "Stealing…" : "Steal this round"}
            </button>
          </div>
        </div>
      )}

      <div
        className={`rounded-2xl border p-5 text-center ${
          isMyTurn ? "animate-on-clock border-accent bg-accent/10" : "border-seam bg-surface"
        }`}
      >
        {draft.status === "complete" ? (
          <p className="font-display text-3xl uppercase text-ink">Draft complete</p>
        ) : (
          <>
            <span className="label">
              Round {currentRound} &middot; Pick {draft.current_pick + 1} of {draft.draft_order.length}
            </span>
            <p className="font-display mt-1 text-3xl uppercase text-ink sm:text-4xl">
              {isMyTurn
                ? "You're on the clock"
                : `Waiting on ${managerById.get(onTheClock ?? "")?.display_name ?? "…"}`}
            </p>
            <PickClock
              draftId={draft.id}
              deadlineAt={draft.deadline_at}
              pickSeconds={draft.pick_seconds}
              isMyTurn={isMyTurn}
              onAutoPick={setNotice}
            />
          </>
        )}
        {poolRestrictionReason && <p className="mt-2 text-xs text-accent">{poolRestrictionReason}</p>}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-flare/40 bg-flare/10 px-3 py-2 text-sm text-flare"
        >
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <RosterColumn
          title="You"
          manager={managerById.get(currentManagerId)}
          picks={myPicks}
          slotDefs={slotDefs}
          justLanded={justLanded}
          hidden={false}
        />

        <div className="order-last flex flex-col gap-3 lg:order-none">
          {draft.status !== "complete" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {POSITION_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPositionTab(tab)}
                    aria-pressed={positionTab === tab}
                    className={`shrink-0 rounded-full border px-3 py-1 font-data text-[11px] tracking-wide ${
                      positionTab === tab
                        ? "border-accent bg-accent font-semibold text-ground"
                        : "border-seam text-ink-dim hover:text-ink"
                    }`}
                  >
                    {tab === "ALL" ? "Best available" : tab}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOnlyFillable((v) => !v)}
                  aria-pressed={onlyFillable}
                  className={`ml-auto shrink-0 rounded-full border px-3 py-1 font-data text-[11px] tracking-wide ${
                    onlyFillable ? "border-jade text-jade" : "border-seam text-ink-dim hover:text-ink"
                  }`}
                >
                  Fills a slot
                </button>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players…"
                aria-label="Search players"
                className="rounded-lg border border-seam bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />

              <div className="overflow-hidden rounded-2xl border border-seam bg-surface">
                {filtered.length === 0 && (
                  <p className="p-6 text-center text-sm text-ink-dim">
                    {term ? `No players match "${search.trim()}".` : "No players available."}
                  </p>
                )}
                {filtered.map((p) => {
                  const canDraft = isMyTurn && hasOpenSlotFor(p.position, myPicks, slotDefs);
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[42px_auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-seam-soft px-3 py-2 first:border-t-0"
                    >
                      {/* Positional rank, e.g. RB14. The board is ordered by
                          points per game across positions, so these numbers
                          are deliberately not sequential. */}
                      <span
                        className="tabular-score text-[11px]"
                        style={{ color: positionColor(p.position) }}
                      >
                        {p.pos_rank ? `${p.position}${p.pos_rank}` : "—"}
                      </span>
                      <PlayerAvatar
                        playerId={p.id}
                        name={p.full_name}
                        position={p.position}
                        team={p.team}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <Link
                          href={`/players/${p.id}`}
                          className="block truncate text-sm text-ink transition-colors hover:text-accent"
                        >
                          {p.full_name}
                        </Link>
                        <span className="font-data text-[10px] text-ink-faint">
                          {/* Position lives in the rank chip on the left. */}
                          {p.team ?? "FA"}
                          {p.years_exp === 0 ? " · Rookie" : ""}
                          {p.games_played ? ` · ${p.games_played}g` : ""}
                        </span>
                      </span>
                      {/* ADP leads because the board is ordered by it, so the
                          sort has to be legible; projection and last
                          season's actual sit underneath as the reasoning. */}
                      <span className="w-20 text-right">
                        <span className="tabular-score block text-xs text-ink">
                          {p.adp !== null ? p.adp.toFixed(1) : "—"}
                          <span className="ml-1 text-ink-faint">adp</span>
                        </span>
                        <span className="tabular-score block text-[11px] text-flare">
                          {p.proj_ppg !== null ? p.proj_ppg.toFixed(1) : "—"}
                          <span className="ml-1 text-ink-faint">proj</span>
                        </span>
                        <span className="tabular-score block text-[11px] text-ink-dim">
                          {p.ppg !== null ? p.ppg.toFixed(1) : "—"}
                          <span className="ml-1 text-ink-faint">act</span>
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={!canDraft || pending !== null}
                        onClick={() => handlePick(p.id)}
                        className={`w-16 shrink-0 rounded-lg border px-2 py-1.5 font-data text-[10px] uppercase tracking-wide ${
                          canDraft
                            ? "border-accent bg-accent font-semibold text-ground hover:opacity-90"
                            : "border-seam text-ink-faint"
                        } disabled:cursor-not-allowed`}
                      >
                        {pending === p.id ? "…" : canDraft ? "Draft" : "Full"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <p className="text-center font-data text-[10px] text-ink-faint">
                Ordered by average draft position &middot; showing {filtered.length} of{" "}
                {players.length - pickedIds.size}
              </p>
            </>
          ) : (
            <a
              href={`/week/${week.id}`}
              className="rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-ground hover:opacity-90"
            >
              Go to matchup
            </a>
          )}
        </div>

        <RosterColumn
          title={opponent?.display_name ?? "Opponent"}
          manager={opponent}
          picks={opponentPicks}
          slotDefs={slotDefs}
          justLanded={justLanded}
          hidden={isBlind}
        />
      </div>
    </>
  );
}

function RosterColumn({
  title,
  manager,
  picks,
  slotDefs,
  justLanded,
  hidden,
}: {
  title: string;
  manager: Manager | undefined | null;
  picks: PickWithPlayer[];
  slotDefs: ReturnType<typeof rosterSlotDefs>;
  justLanded?: string | null;
  hidden: boolean;
}) {
  const rows: { slot: string; pick: PickWithPlayer | null }[] = [];
  for (const def of slotDefs) {
    const picksForSlot = picks.filter((p) => p.roster_slot === def.slot);
    for (let i = 0; i < def.count; i++) {
      rows.push({ slot: def.slot, pick: picksForSlot[i] ?? null });
    }
  }
  const total = slotDefs.reduce((a, d) => a + d.count, 0);

  return (
    <section
      className="h-fit overflow-hidden rounded-2xl border bg-surface"
      style={{ borderColor: manager?.accent_color ?? "var(--seam)" }}
    >
      <header className="flex items-center gap-2 border-b border-seam-soft px-3 py-2.5">
        {manager && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: manager.accent_color }}
          />
        )}
        <span className="truncate text-sm font-semibold text-ink">{title}</span>
        <span className="tabular-score ml-auto text-xs text-ink-faint">
          {picks.length}/{total}
        </span>
      </header>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2 border-t border-seam-soft px-3 py-1.5 first:border-t-0 ${
              row.pick && row.pick.id === justLanded ? "animate-pick" : ""
            }`}
            style={
              { "--pulse": manager?.accent_color ?? "var(--accent)" } as React.CSSProperties
            }
          >
            <span className="label">{row.slot}</span>
            {hidden && row.pick ? (
              // Blind Draft should look like a face-down card, not the word
              // "hidden" — the mechanic is the point of the rule.
              <span className="flex h-5 items-center rounded border border-dashed border-orchid/50 bg-orchid/10 px-2 font-data text-[9px] uppercase tracking-widest text-orchid">
                Face down
              </span>
            ) : row.pick?.players ? (
              <span className="truncate text-xs text-ink">
                {row.pick.players.full_name}
                <span className="ml-1 font-data text-[9px] text-ink-faint">
                  {row.pick.players.team}
                </span>
              </span>
            ) : (
              <span className="text-xs text-ink-faint">—</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
