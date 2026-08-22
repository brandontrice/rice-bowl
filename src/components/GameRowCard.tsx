"use client";

import Image from "next/image";
import { easternDay, formatDayKey } from "@/lib/nfl-date";
import type { Game } from "@/lib/schedule-data";

/** ESPN's logo CDN, keyed by abbreviation. WAS is WSH over there. */
function logoFor(team: string | null) {
  if (!team) return null;
  const espn = team === "WAS" ? "wsh" : team.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espn}.png`;
}

function TeamSide({
  team,
  name,
  score,
  won,
  align = "left",
}: {
  team: string | null;
  name: string | null;
  score: number | null;
  won: boolean;
  align?: "left" | "right";
}) {
  const logo = logoFor(team);
  const right = align === "right";

  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${right ? "flex-row-reverse text-right" : ""}`}
    >
      {logo && (
        <Image
          src={logo}
          alt=""
          width={26}
          height={26}
          className="h-6 w-6 shrink-0 object-contain"
          unoptimized
        />
      )}
      <span className="min-w-0">
        <span className={`block truncate text-sm ${won ? "font-semibold text-ink" : "text-ink-dim"}`}>
          {name ?? team ?? "TBD"}
        </span>
        {team && <span className="font-data text-[10px] text-ink-faint">{team}</span>}
      </span>
      {score !== null && (
        <span
          className={`tabular-score shrink-0 text-lg ${won ? "text-ink" : "text-ink-faint"}`}
        >
          {score}
        </span>
      )}
    </span>
  );
}

/**
 * One game. Time is rendered client-side so it lands in whichever timezone
 * the manager is actually in — the server would have to pick one, and this
 * league does not agree on a home city.
 */
export function GameRowCard({
  game,
  showDate = false,
}: {
  game: Game;
  /** Team view has no day headers, so each card carries its own date. */
  showDate?: boolean;
}) {
  const kickoff = game.kickoff_at ? new Date(game.kickoff_at) : null;
  const final = game.status === "post";
  const live = game.status === "in";

  const homeWon = final && (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = final && (game.away_score ?? 0) > (game.home_score ?? 0);

  return (
    <article className="lift flex flex-col gap-2 rounded-xl border border-seam bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <TeamSide
          team={game.away_team}
          name={game.away_name}
          score={final || live ? game.away_score : null}
          won={awayWon}
        />
        <span className="shrink-0 font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {game.neutral_site ? "vs" : "@"}
        </span>
        <TeamSide
          team={game.home_team}
          name={game.home_name}
          score={final || live ? game.home_score : null}
          won={homeWon}
          align="right"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-seam-soft pt-2 font-data text-[10px] text-ink-faint">
        {showDate && game.kickoff_at && (
          <span className="text-ink">{formatDayKey(easternDay(game.kickoff_at), "short")}</span>
        )}
        {live ? (
          <span className="flex items-center gap-1.5 text-jade">
            <span className="animate-waiting h-1.5 w-1.5 rounded-full bg-jade" />
            {game.status_detail ?? "Live"}
          </span>
        ) : final ? (
          <span className="text-ink-dim">Final</span>
        ) : (
          kickoff &&
          // The NFL flexes late-season games, and ESPN carries those with a
          // midnight placeholder. Printing it would claim a kickoff time
          // nobody has set.
          (game.time_valid ? (
            // Day headers are bucketed by Eastern, which is how the league
            // schedules; the time is the viewer's own, so it names its zone
            // rather than leaving the two looking like they disagree.
            <span className="text-ink-dim">
              {kickoff.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </span>
          ) : (
            <span className="text-flare">Time TBD</span>
          ))
        )}
        {game.network && <span>{game.network}</span>}
        {game.venue && <span className="truncate">{game.venue}</span>}
        {game.neutral_site && <span className="text-flare">Neutral site</span>}
        <span className="ml-auto">Wk {game.week}</span>
      </div>
    </article>
  );
}
