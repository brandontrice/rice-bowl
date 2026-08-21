import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagers, getBowlStandings } from "@/lib/data";
import { BowlStandings } from "@/components/BowlStandings";
import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import type { Wager } from "@/types/database";

export default async function SeasonPage() {
  const supabase = await createClient();
  const [managers, standings] = await Promise.all([getManagers(), getBowlStandings()]);
  const managerById = new Map(managers.map((m) => [m.id, m]));

  const { data: season } = await supabase
    .from("seasons")
    .select("*")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: weeks } = season
    ? await supabase
        .from("weeks")
        .select("*")
        .eq("season_id", season.id)
        .order("week_number", { ascending: false })
    : { data: [] };

  const weekIds = (weeks ?? []).map((w) => w.id);
  const { data: wagers } =
    weekIds.length > 0
      ? await supabase
          .from("wagers")
          .select("*")
          .in("week_id", weekIds)
          .order("created_at", { ascending: false })
      : { data: [] as Wager[] };

  const weekNumberById = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase text-canvas-fg">
          {season ? season.name : "Season"}
        </h1>
        <p className="text-sm text-canvas-muted">Week-by-week history and the running ledger.</p>
      </div>

      <BowlStandings managers={managers} standings={standings} />

      <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-canvas-muted">
          Weeks
        </h3>
        <div className="flex flex-col divide-y divide-canvas-border/60">
          {(weeks ?? []).map((w) => {
            const rule = HOUSE_RULE_BY_KEY[w.house_rule_key];
            const winner = w.winner_manager_id ? managerById.get(w.winner_manager_id) : null;
            return (
              <Link
                key={w.id}
                href={`/week/${w.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:opacity-90"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-canvas-fg">
                    Week {w.week_number}
                    <span className="ml-2 font-normal text-canvas-muted">{rule?.name}</span>
                  </p>
                  <p className="text-xs text-canvas-muted">
                    {w.status === "complete"
                      ? winner
                        ? `${winner.display_name} won · ${w.home_score?.toFixed(1)} – ${w.away_score?.toFixed(1)}`
                        : "Tied"
                      : w.status === "drafting"
                        ? "Drafting"
                        : "In progress"}
                  </p>
                </div>
                {winner && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: winner.accent_color }}
                  />
                )}
              </Link>
            );
          })}
          {(weeks ?? []).length === 0 && (
            <p className="py-3 text-sm text-canvas-muted">No weeks yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-canvas-muted">
          Wager Ledger
        </h3>
        <div className="flex flex-col gap-2">
          {(wagers ?? []).map((w) => (
            <div key={w.id} className="rounded-xl border border-canvas-border/70 bg-canvas p-3 text-sm">
              <p className="text-canvas-fg">
                <span className="mr-2 text-xs text-canvas-muted">Wk {weekNumberById.get(w.week_id)}</span>
                {w.description}
              </p>
              <p className="mt-1 text-xs text-canvas-muted">
                {w.status === "settled"
                  ? w.loser_manager_id
                    ? `${managerById.get(w.loser_manager_id)?.display_name} pays up`
                    : "Settled"
                  : "Pending"}
              </p>
            </div>
          ))}
          {(wagers ?? []).length === 0 && <p className="text-sm text-canvas-muted">No wagers yet.</p>}
        </div>
      </div>
    </div>
  );
}
