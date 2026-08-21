import type { DraftPick, Manager, Player, Week } from "@/types/database";
import { rosterSlotDefs } from "@/lib/draft";
import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

type PickWithPlayer = DraftPick & { players: Player | null };

export function RosterGrid({
  manager,
  picks,
  scores,
  week,
  isMe,
  totalPoints,
}: {
  manager: Manager;
  picks: PickWithPlayer[];
  scores: Map<string, number>;
  week: Pick<Week, "house_rule_key" | "flex_position">;
  isMe: boolean;
  totalPoints: number | null;
}) {
  const slotDefs = rosterSlotDefs(week);
  const rows: { slot: string; pick: PickWithPlayer | null }[] = [];
  for (const def of slotDefs) {
    const picksForSlot = picks.filter((p) => p.roster_slot === def.slot);
    for (let i = 0; i < def.count; i++) {
      rows.push({ slot: def.slot, pick: picksForSlot[i] ?? null });
    }
  }

  const rule = HOUSE_RULE_BY_KEY[week.house_rule_key];
  const rookieOk =
    rule?.key !== "rookie_rule" || picks.some((p) => (p.players?.years_exp ?? -1) === 0);
  const loyaltyOk =
    rule?.key !== "loyalty_clause" ||
    picks.filter((p) => p.players?.team === manager.favorite_team).length >= 2;

  const scored = rows
    .map((r) => (r.pick ? (scores.get(r.pick.player_id) ?? null) : null))
    .filter((v): v is number => v !== null);
  const best = scored.length > 0 ? Math.max(...scored) : null;

  return (
    <section className="overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: manager.accent_color }}>
      {/* The manager's colour is the rail down the side, not a wash over the
          whole card — a tinted background made the two rosters hard to scan. */}
      <header className="flex items-center gap-2.5 border-b border-seam-soft px-4 py-3">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: manager.accent_color }}
        />
        <span className="truncate text-sm font-semibold text-ink">{manager.display_name}</span>
        {isMe && <span className="label">You</span>}
        <span className="tabular-score ml-auto text-2xl font-semibold text-ink">
          {totalPoints !== null ? totalPoints.toFixed(1) : "—"}
        </span>
      </header>

      <div className="flex flex-col">
        {rows.map((row, i) => {
          const points = row.pick ? (scores.get(row.pick.player_id) ?? null) : null;
          const isBest = best !== null && points === best && points > 0;
          return (
            <div
              key={i}
              className="grid grid-cols-[34px_auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-seam-soft px-4 py-2 first:border-t-0"
            >
              <span className="label">{row.slot}</span>
              {row.pick?.players ? (
                <PlayerAvatar
                  playerId={row.pick.player_id}
                  name={row.pick.players.full_name}
                  position={row.pick.players.position}
                  team={row.pick.players.team}
                  size="sm"
                />
              ) : (
                <span className="h-6 w-6 rounded-lg border border-dashed border-seam" />
              )}
              {row.pick?.players ? (
                <span className="truncate text-sm text-ink">
                  {row.pick.players.full_name}
                  <span className="ml-1.5 font-data text-[10px] text-ink-faint">
                    {row.pick.players.team}
                  </span>
                </span>
              ) : (
                <span className="text-sm text-ink-faint">Empty</span>
              )}
              <span
                className={`tabular-score text-sm ${isBest ? "text-jade" : "text-ink-dim"}`}
                title={isBest ? "Top scorer on this roster" : undefined}
              >
                {points !== null ? points.toFixed(1) : row.pick ? "—" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {(rule?.key === "rookie_rule" || rule?.key === "loyalty_clause") && (
        <p
          className={`border-t border-seam-soft px-4 py-2.5 text-xs ${
            (rule.key === "rookie_rule" ? rookieOk : loyaltyOk) ? "text-jade" : "text-crimson"
          }`}
        >
          {rule.key === "rookie_rule"
            ? rookieOk
              ? "Rookie Rule satisfied."
              : "Rookie Rule not met — no rookie rostered."
            : loyaltyOk
              ? "Loyalty Clause satisfied."
              : `Loyalty Clause not met — need 2+ ${manager.favorite_team ?? "favorite team"} players.`}
        </p>
      )}
    </section>
  );
}
