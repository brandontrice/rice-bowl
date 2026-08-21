import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getManagers, getBowlStandings } from "@/lib/data";
import { BowlStandings } from "@/components/BowlStandings";
import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import { RULE_STYLE } from "@/lib/rule-style";
import { Shell } from "@/components/ui/Shell";
import type { Manager, Wager, Week } from "@/types/database";

export const metadata: Metadata = { title: "Season" };

/** Head-to-head record per rule category — the kind of stat this league argues about. */
function categoryRecords(weeks: Week[], managers: Manager[]) {
  const byCategory = new Map<string, Map<string, number>>();

  for (const w of weeks) {
    if (w.status !== "complete" || !w.winner_manager_id) continue;
    const rule = HOUSE_RULE_BY_KEY[w.house_rule_key];
    if (!rule) continue;
    const bucket = byCategory.get(rule.enforcement) ?? new Map<string, number>();
    bucket.set(w.winner_manager_id, (bucket.get(w.winner_manager_id) ?? 0) + 1);
    byCategory.set(rule.enforcement, bucket);
  }

  return [...byCategory.entries()]
    .map(([enforcement, tally]) => ({
      enforcement: enforcement as keyof typeof RULE_STYLE,
      counts: managers.map((m) => tally.get(m.id) ?? 0),
      total: [...tally.values()].reduce((a, c) => a + c, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export default async function SeasonPage() {
  const supabase = await createClient();

  const [managers, standings, { data: season }] = await Promise.all([
    getManagers(),
    getBowlStandings(),
    supabase.from("seasons").select("*").order("year", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const managerById = new Map(managers.map((m) => [m.id, m]));

  const { data: weeksRaw } = season
    ? await supabase
        .from("weeks")
        .select("*")
        .eq("season_id", season.id)
        .order("week_number", { ascending: false })
    : { data: [] as Week[] };
  const weeks = (weeksRaw ?? []) as Week[];

  const weekIds = weeks.map((w) => w.id);
  const { data: wagers } =
    weekIds.length > 0
      ? await supabase
          .from("wagers")
          .select("*")
          .in("week_id", weekIds)
          .order("created_at", { ascending: false })
      : { data: [] as Wager[] };

  const weekNumberById = new Map(weeks.map((w) => [w.id, w.week_number]));
  const completed = weeks.filter((w) => w.status === "complete");

  // weeks arrives newest-first, so the current streak is the leading run.
  let streak: { manager: Manager; count: number } | null = null;
  for (const w of completed) {
    if (!w.winner_manager_id) break;
    const manager = managerById.get(w.winner_manager_id);
    if (!manager) break;
    if (!streak) streak = { manager, count: 1 };
    else if (streak.manager.id === manager.id) streak.count += 1;
    else break;
  }

  const records = categoryRecords(weeks, managers);

  return (
    <Shell>
      <header>
        <h1 className="font-display text-4xl uppercase text-ink">
          {season ? season.name : "Season"}
        </h1>
        <p className="mt-1 text-sm text-ink-dim">Week-by-week history and the running ledger.</p>
      </header>

      <BowlStandings
        managers={managers}
        standings={standings}
        weeksPlayed={completed.length}
        streak={streak}
        meta={season ? String(season.year) : undefined}
      />

      {records.length > 0 && managers.length === 2 && (
        <section className="rounded-2xl border border-seam bg-surface p-4">
          <h2 className="label mb-3">Record by rule type</h2>
          <div className="flex flex-col gap-2">
            {records.map(({ enforcement, counts }) => {
              const style = RULE_STYLE[enforcement];
              return (
                <div key={enforcement} className="flex items-center gap-3">
                  <span
                    className="w-24 shrink-0 font-data text-[10px] uppercase tracking-[0.1em]"
                    style={{ color: style.color }}
                  >
                    {style.label}
                  </span>
                  <span className="tabular-score text-sm text-ink">
                    {counts[0]}–{counts[1]}
                  </span>
                  <span className="truncate text-xs text-ink-faint">
                    {managers[0].display_name} vs {managers[1].display_name}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-seam bg-surface">
        <h2 className="label border-b border-seam-soft px-4 py-3">Weeks</h2>
        <div className="flex flex-col">
          {weeks.map((w) => {
            const rule = HOUSE_RULE_BY_KEY[w.house_rule_key];
            const style = rule ? RULE_STYLE[rule.enforcement] : null;
            const winner = w.winner_manager_id ? managerById.get(w.winner_manager_id) : null;

            return (
              <Link
                key={w.id}
                href={`/week/${w.id}`}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-seam-soft px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-raised"
              >
                <span className="font-data text-[11px] text-ink-faint">WK {w.week_number}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{rule?.name}</span>
                  {style && (
                    <span
                      className="font-data text-[10px] uppercase tracking-[0.1em]"
                      style={{ color: style.color }}
                    >
                      {style.label}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3 justify-self-end">
                  {w.status === "complete" ? (
                    <span className="tabular-score text-xs text-ink-dim">
                      {w.home_score?.toFixed(1)} – {w.away_score?.toFixed(1)}
                    </span>
                  ) : (
                    <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                      {w.status === "drafting" ? "Drafting" : "In progress"}
                    </span>
                  )}
                  {w.status === "complete" && (
                    <span
                      className="w-20 shrink-0 truncate rounded-full px-2 py-1 text-center font-data text-[9px] uppercase tracking-wide"
                      style={
                        winner
                          ? {
                              color: winner.accent_color,
                              backgroundColor: `color-mix(in srgb, ${winner.accent_color} 16%, transparent)`,
                            }
                          : { color: "var(--ink-dim)", backgroundColor: "var(--surface-raised)" }
                      }
                    >
                      {winner ? winner.display_name : "Tied"}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
          {weeks.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-dim">No weeks yet.</p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-seam bg-surface">
        <h2 className="label border-b border-seam-soft px-4 py-3">Wager Ledger</h2>
        <div className="flex flex-col">
          {(wagers ?? []).map((w) => (
            <div key={w.id} className="border-t border-seam-soft px-4 py-3 first:border-t-0">
              <p className="text-sm text-ink">
                <span className="mr-2 font-data text-[10px] text-ink-faint">
                  WK {weekNumberById.get(w.week_id)}
                </span>
                {w.description}
              </p>
              <p className="mt-1 text-xs text-ink-dim">
                {w.status === "settled"
                  ? w.loser_manager_id
                    ? `${managerById.get(w.loser_manager_id)?.display_name} pays up`
                    : "Settled"
                  : "Pending"}
              </p>
            </div>
          ))}
          {(wagers ?? []).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-dim">No wagers yet.</p>
          )}
        </div>
      </section>
    </Shell>
  );
}
