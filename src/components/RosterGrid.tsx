import type { DraftPick, Manager, Player, Week } from "@/types/database";
import { rosterSlotDefs } from "@/lib/draft";
import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";

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

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: isMe ? manager.accent_color : "var(--seam)",
        backgroundColor: isMe ? `${manager.accent_color}14` : "var(--surface)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 shrink-0 rounded-full"
            style={{ backgroundColor: manager.accent_color }}
          />
          <span className="font-semibold text-ink">{manager.display_name}</span>
        </div>
        <span className="font-display text-3xl tabular-score text-ink">
          {totalPoints !== null ? totalPoints.toFixed(1) : "—"}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-seam/60">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                {row.slot}
              </span>
              {row.pick?.players ? (
                <span className="truncate text-ink">
                  {row.pick.players.full_name}
                  <span className="ml-1 text-ink-dim">{row.pick.players.team}</span>
                </span>
              ) : (
                <span className="text-ink-dim">Empty</span>
              )}
            </div>
            <span className="shrink-0 tabular-score text-ink-dim">
              {row.pick ? (scores.get(row.pick.player_id)?.toFixed(1) ?? "—") : ""}
            </span>
          </div>
        ))}
      </div>

      {(rule?.key === "rookie_rule" || rule?.key === "loyalty_clause") && (
        <p className={`mt-3 text-xs ${(rule.key === "rookie_rule" ? rookieOk : loyaltyOk) ? "text-jade" : "text-crimson"}`}>
          {rule.key === "rookie_rule"
            ? rookieOk
              ? "Rookie Rule satisfied."
              : "Rookie Rule not met — no rookie rostered."
            : loyaltyOk
              ? "Loyalty Clause satisfied."
              : `Loyalty Clause not met — need 2+ ${manager.favorite_team ?? "favorite team"} players.`}
        </p>
      )}
    </div>
  );
}
