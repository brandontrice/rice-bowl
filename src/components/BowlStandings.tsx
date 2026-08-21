import { HeadToHead } from "@/components/HeadToHead";
import type { Manager } from "@/types/database";

/** Bowl Points as a scoreboard rather than a two-row list. */
export function BowlStandings({
  managers,
  standings,
  weeksPlayed,
  streak,
  meta,
}: {
  managers: Manager[];
  standings: Map<string, number>;
  weeksPlayed?: number;
  streak?: { manager: Manager; count: number } | null;
  meta?: React.ReactNode;
}) {
  return (
    <HeadToHead
      managers={managers}
      values={standings}
      unit="Bowl points"
      digits={0}
      meta={meta}
      footNote={
        weeksPlayed === undefined ? undefined : (
          <>
            <span>
              {streak && streak.count > 1 ? (
                <>
                  {streak.manager.display_name} has won{" "}
                  <strong className="font-semibold text-ink">{streak.count} straight</strong>
                </>
              ) : (
                "Every completed week is worth one Bowl Point."
              )}
            </span>
            <span className="font-data text-[11px] text-ink-faint">
              {weeksPlayed} {weeksPlayed === 1 ? "week" : "weeks"} played
            </span>
          </>
        )
      }
    />
  );
}
