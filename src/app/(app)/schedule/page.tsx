import type { Metadata } from "next";
import Link from "next/link";
import {
  byDay,
  defaultWeek,
  getTeamGames,
  getTeams,
  getWeekGames,
  REGULAR_SEASON_WEEKS,
} from "@/lib/schedule-data";
import { GameRowCard } from "@/components/GameRowCard";
import { Shell } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "Schedule" };

function formatDay(day: string) {
  if (day === "tbd") return "Date to be confirmed";
  // Parsed as UTC noon so the label can't slip a day either way.
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; team?: string }>;
}) {
  const { week: weekParam, team: teamParam } = await searchParams;
  const { season, week: fallbackWeek } = await defaultWeek();

  const team = teamParam?.toUpperCase();
  const parsed = Number(weekParam);
  const week =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= REGULAR_SEASON_WEEKS
      ? parsed
      : fallbackWeek;

  const [games, teams] = await Promise.all([
    team ? getTeamGames(season, team) : getWeekGames(season, week),
    getTeams(season),
  ]);

  const days = team ? [] : byDay(games);

  return (
    <Shell width="wide">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl uppercase text-ink">
            {team ? `${team} schedule` : "Schedule"}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {team
              ? `Every ${season} regular-season game for ${team}.`
              : `Week ${week} of the ${season} regular season. Times are shown in your timezone.`}
          </p>
        </div>
        <span className="font-data text-[11px] text-ink-faint">
          {games.length} {games.length === 1 ? "game" : "games"}
        </span>
      </header>

      {/* Week strip. Hidden in team view, where weeks are the rows. */}
      {!team && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Week">
          {Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1).map((w) => (
            <Link
              key={w}
              href={`/schedule?week=${w}`}
              aria-current={w === week ? "page" : undefined}
              className={`rounded-full border px-3 py-1 font-data text-[11px] transition-colors ${
                w === week
                  ? "border-accent bg-accent font-semibold text-ground"
                  : "border-seam text-ink-dim hover:text-ink"
              }`}
            >
              {w}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`/schedule?week=${week}`}
          className={`rounded-full border px-3 py-1 font-data text-[11px] transition-colors ${
            team ? "border-seam text-ink-dim hover:text-ink" : "border-accent text-accent"
          }`}
        >
          All teams
        </Link>
        {teams.map((t) => (
          <Link
            key={t}
            href={`/schedule?team=${t}`}
            aria-current={t === team ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 font-data text-[11px] transition-colors ${
              t === team
                ? "border-accent bg-accent font-semibold text-ground"
                : "border-seam text-ink-faint hover:text-ink"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {games.length === 0 && (
        <p className="rounded-2xl border border-dashed border-seam px-4 py-12 text-center text-sm text-ink-dim">
          No games cached yet. The daily sync fills this in — or run the player sync to pull it
          now.
        </p>
      )}

      {team ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {games.map((g) => (
            <GameRowCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        days.map(({ day, games: dayGames }) => (
          <section key={day} className="flex flex-col gap-2.5">
            <header className="flex items-center gap-3">
              <span className="label shrink-0">{formatDay(day)}</span>
              <span className="h-px flex-1 bg-seam" />
              <span className="font-data text-[10px] text-ink-faint">{dayGames.length}</span>
            </header>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {dayGames.map((g) => (
                <GameRowCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        ))
      )}
    </Shell>
  );
}
