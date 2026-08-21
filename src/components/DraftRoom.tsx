"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rosterSlotDefs, hasOpenSlotFor, TOTAL_ROSTER_SIZE } from "@/lib/draft";
import { HouseRuleCard } from "@/components/HouseRuleCard";
import type { Draft, DraftPick, Manager, Player, Week } from "@/types/database";

type PickWithPlayer = DraftPick & { players: Player | null };

const POSITION_TABS = ["ALL", "QB", "RB", "WR", "TE", "DEF"] as const;

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
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sniperRound, setSniperRound] = useState(1);
  const [sniping, setSniping] = useState(false);

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
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drafts", filter: `id=eq.${draft.id}` },
        (payload) => {
          const row = payload.new as Draft;
          setDraft(row);
          if (row.status === "complete") {
            router.refresh();
          }
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

  const filtered = players
    .filter((p) => !pickedIds.has(p.id))
    .filter((p) => positionTab === "ALL" || p.position === positionTab)
    .filter((p) => (search.trim() ? p.full_name.toLowerCase().includes(search.trim().toLowerCase()) : true))
    .slice(0, 200);

  async function handlePick(playerId: string) {
    setPending(playerId);
    setError(null);
    const res = await fetch(`/api/draft/${draft.id}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Pick failed");
      setPending(null);
      return;
    }
    setPending(null);
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
    <div className="flex flex-col gap-5">
      <HouseRuleCard
        week={week}
        sniperManager={week.sniper_manager_id ? (managerById.get(week.sniper_manager_id) ?? null) : null}
        compact
      />

      {canSnipe && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm font-semibold text-canvas-fg">You&apos;re the Sniper.</p>
          <p className="mt-1 text-xs text-canvas-muted">
            Steal the first pick of one round from your opponent, before the draft starts.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={sniperRound}
              onChange={(e) => setSniperRound(Number(e.target.value))}
              className="rounded-lg border border-canvas-border bg-canvas px-2 py-1.5 text-sm text-canvas-fg"
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
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {sniping ? "Stealing…" : "Steal this round"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4 text-center">
        {draft.status === "complete" ? (
          <p className="font-display text-2xl uppercase text-canvas-fg">Draft complete</p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-canvas-muted">
              Round {currentRound} · Pick {draft.current_pick + 1}
            </p>
            <p className="font-display text-3xl uppercase text-canvas-fg">
              {isMyTurn ? "You're on the clock" : `Waiting on ${managerById.get(onTheClock ?? "")?.display_name ?? "…"}`}
            </p>
          </>
        )}
        {poolRestrictionReason && (
          <p className="mt-2 text-xs text-accent">{poolRestrictionReason}</p>
        )}
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RosterColumn
          title="You"
          manager={managerById.get(currentManagerId)}
          picks={myPicks}
          slotDefs={slotDefs}
          hidden={false}
        />
        <RosterColumn
          title={opponent?.display_name ?? "Opponent"}
          manager={opponent}
          picks={opponentPicks}
          slotDefs={slotDefs}
          hidden={isBlind}
        />
      </div>

      {draft.status !== "complete" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 overflow-x-auto">
            {POSITION_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPositionTab(tab)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                  positionTab === tab
                    ? "border-accent bg-accent text-white"
                    : "border-canvas-border text-canvas-muted hover:text-canvas-fg"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="rounded-lg border border-canvas-border bg-canvas-card px-3 py-2 text-sm text-canvas-fg outline-none focus:border-accent"
          />

          <div className="flex flex-col divide-y divide-canvas-border/60 rounded-2xl border border-canvas-border bg-canvas-card">
            {filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-canvas-muted">No players match.</p>
            )}
            {filtered.map((p) => {
              const openSlot = hasOpenSlotFor(p.position, myPicks, slotDefs);
              const canDraft = isMyTurn && openSlot;
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-canvas-fg">{p.full_name}</p>
                    <p className="text-xs text-canvas-muted">
                      {p.position} · {p.team}
                      {typeof p.years_exp === "number" ? ` · ${p.years_exp === 0 ? "Rookie" : `${p.years_exp}y exp`}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canDraft || pending !== null}
                    onClick={() => handlePick(p.id)}
                    className="shrink-0 rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent enabled:hover:bg-accent enabled:hover:text-white disabled:opacity-30"
                  >
                    {pending === p.id ? "…" : "Draft"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft.status === "complete" && (
        <a
          href={`/week/${week.id}`}
          className="rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          Go to matchup
        </a>
      )}
    </div>
  );
}

function RosterColumn({
  title,
  manager,
  picks,
  slotDefs,
  hidden,
}: {
  title: string;
  manager: Manager | undefined | null;
  picks: PickWithPlayer[];
  slotDefs: ReturnType<typeof rosterSlotDefs>;
  hidden: boolean;
}) {
  const rows: { slot: string; pick: PickWithPlayer | null }[] = [];
  for (const def of slotDefs) {
    const picksForSlot = picks.filter((p) => p.roster_slot === def.slot);
    for (let i = 0; i < def.count; i++) {
      rows.push({ slot: def.slot, pick: picksForSlot[i] ?? null });
    }
  }

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: manager?.accent_color ?? "var(--canvas-border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        {manager && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: manager.accent_color }} />}
        <span className="text-sm font-semibold text-canvas-fg">{title}</span>
        <span className="ml-auto text-xs text-canvas-muted">{picks.length}/{slotDefs.reduce((a, d) => a + d.count, 0)}</span>
      </div>
      <div className="flex flex-col divide-y divide-canvas-border/60 text-xs">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <span className="w-9 shrink-0 font-semibold uppercase text-canvas-muted">{row.slot}</span>
            {hidden && row.pick ? (
              <span className="italic text-canvas-muted">Hidden pick</span>
            ) : row.pick?.players ? (
              <span className="truncate text-canvas-fg">
                {row.pick.players.full_name} <span className="text-canvas-muted">{row.pick.players.team}</span>
              </span>
            ) : (
              <span className="text-canvas-muted">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
