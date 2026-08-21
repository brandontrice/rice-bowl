import type { Manager } from "@/types/database";

export function BowlStandings({
  managers,
  standings,
}: {
  managers: Manager[];
  standings: Map<string, number>;
}) {
  return (
    <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-canvas-muted">
        Bowl Point Standings
      </h3>
      <div className="flex flex-col gap-2">
        {managers.map((m) => (
          <div key={m.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.accent_color }} />
              <span className="text-sm text-canvas-fg">{m.display_name}</span>
            </div>
            <span className="font-display text-2xl tabular-score text-canvas-fg">
              {standings.get(m.id) ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
