import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { Manager } from "@/types/database";

/**
 * The rivalry, expressed structurally. Both managers' accent colours split
 * one bar in proportion to the score, so who is ahead — and by how much —
 * reads before either number does.
 */
export function HeadToHead({
  managers,
  values,
  unit,
  footNote,
  meta,
  digits = 1,
}: {
  managers: Manager[];
  values: Map<string, number>;
  /** Shown under each number, e.g. "Points" or "Bowl points". */
  unit?: string;
  footNote?: React.ReactNode;
  meta?: React.ReactNode;
  digits?: number;
}) {
  const [a, b] = managers;
  if (!a || !b) return null;

  const scoreA = values.get(a.id) ?? 0;
  const scoreB = values.get(b.id) ?? 0;
  const total = scoreA + scoreB;

  // A dead-even split when nothing has happened yet reads better than a
  // collapsed bar or a divide-by-zero.
  const shareA = total > 0 ? (scoreA / total) * 100 : 50;
  const leader = scoreA === scoreB ? null : scoreA > scoreB ? a : b;

  return (
    <section className="field-lines overflow-hidden rounded-2xl border border-seam bg-surface">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pb-4 pt-5">
        <ManagerSide manager={a} score={scoreA} unit={unit} digits={digits} dimmed={leader !== null && leader.id !== a.id}
        />
        <span className="font-display text-sm uppercase tracking-wide text-ink-faint">
          {meta ?? "vs"}
        </span>
        <ManagerSide
          manager={b}
          score={scoreB}
          unit={unit}
          digits={digits}
          dimmed={leader !== null && leader.id !== b.id}
          align="right"
        />
      </div>

      <div className="flex h-1.5" aria-hidden="true">
        <span
          className="block transition-[width] duration-700 ease-out"
          style={{ width: `${shareA}%`, backgroundColor: a.accent_color }}
        />
        <span
          className="block flex-1 transition-[width] duration-700 ease-out"
          style={{ backgroundColor: b.accent_color }}
        />
      </div>

      {footNote && (
        <div className="flex items-center justify-between gap-3 border-t border-seam-soft px-5 py-2.5 text-xs text-ink-dim">
          {footNote}
        </div>
      )}
    </section>
  );
}

function ManagerSide({
  manager,
  score,
  unit,
  digits,
  dimmed,
  align = "left",
}: {
  manager: Manager;
  score: number;
  unit?: string;
  digits: number;
  dimmed?: boolean;
  align?: "left" | "right";
}) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${right ? "items-end text-right" : ""}`}>
      <span className={`flex items-center gap-2 text-sm font-semibold text-ink ${right ? "flex-row-reverse" : ""}`}>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: manager.accent_color }}
        />
        <span className="truncate">{manager.display_name}</span>
      </span>
      <span
        className={`tabular-score text-4xl font-semibold leading-none tracking-tight ${
          dimmed ? "text-ink-dim" : "text-ink"
        }`}
      >
        <AnimatedNumber value={score} digits={digits} />
      </span>
      {unit && <span className="label">{unit}</span>}
    </div>
  );
}
