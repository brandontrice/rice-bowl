"use client";

import type { TeamGame } from "@/lib/game-status";

/**
 * What this player's team is doing right now: kickoff time before the
 * game, a live marker during it, "Final" after, and "Bye" when they have
 * no game at all. Answers "why is this number still zero" without anyone
 * having to go and look.
 */
export function GameNote({ team, game }: { team: string | null; game: TeamGame | null }) {
  if (!team) return <span className="font-data text-[10px] text-ink-faint">FA</span>;

  if (!game) {
    return (
      <span className="font-data text-[10px] text-ink-faint">
        {team} · Bye
      </span>
    );
  }

  const opponent = `${game.home ? "vs" : "@"} ${game.opponent ?? "TBD"}`;

  if (game.status === "in") {
    return (
      <span className="flex items-center gap-1 font-data text-[10px] text-jade">
        <span className="animate-waiting h-1 w-1 rounded-full bg-jade" />
        {game.status_detail ?? "Live"} {opponent}
      </span>
    );
  }

  if (game.status === "post") {
    return (
      <span className="font-data text-[10px] text-ink-faint">
        Final {opponent}
      </span>
    );
  }

  const kickoff = game.kickoff_at && game.time_valid ? new Date(game.kickoff_at) : null;
  return (
    <span className="font-data text-[10px] text-ink-faint">
      {opponent}
      {kickoff
        ? ` · ${kickoff.toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}`
        : " · TBD"}
    </span>
  );
}
