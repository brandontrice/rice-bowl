import type { Metadata } from "next";
import Link from "next/link";
import { listRankedPlayers, type PlayerSort } from "@/lib/player-browser";
import { BROWSABLE_POSITIONS } from "@/lib/positions";
import { positionColor } from "@/lib/rule-style";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PlayerFilters } from "@/components/PlayerFilters";
import { Shell } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "Players" };

/** One template so the header and the rows can never drift apart. */
const GRID =
  "grid-cols-[42px_minmax(0,1fr)_50px_50px_54px] items-center gap-2 sm:gap-3 sm:grid-cols-[46px_minmax(0,1fr)_62px_62px_62px_66px]";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string; q?: string; sort?: string }>;
}) {
  const { pos, q, sort: sortParam } = await searchParams;
  const position = pos && BROWSABLE_POSITIONS.includes(pos as never) ? pos : "ALL";
  const sort: PlayerSort =
    sortParam === "adp" || sortParam === "proj" ? sortParam : "last";
  const { players, seasons } = await listRankedPlayers({ position, search: q, sort });

  return (
    <Shell width="wide">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl uppercase text-ink">Players</h1>
          <p className="mt-1 max-w-prose text-sm text-ink-dim">
            {sort === "adp"
              ? "In draft order — average draft position across Sleeper leagues, which is what the draft board and auto-draft use."
              : sort === "proj"
                ? `By Sleeper's ${seasons.current} projected points per game.`
                : `By ${seasons.previous} PPR points per game, with ${seasons.current} filling in beside it as games are played.`}
          </p>
        </div>
        <span className="font-data text-[11px] text-ink-faint">
          {players.length} shown
        </span>
      </header>

      <PlayerFilters position={position} search={q ?? ""} sort={sort} />

      <section className="overflow-hidden rounded-2xl border border-seam bg-surface">
        <header className={`grid ${GRID} border-b border-seam-soft px-4 py-2.5`}>
          <span className="label">Rank</span>
          <span className="label">Player</span>
          <span className="label text-right">{seasons.previous}</span>
          {/* This season is empty until games are played, and it is the
              least useful column on a phone, so it is the one that goes. */}
          <span className="label hidden text-right sm:block">{seasons.current}</span>
          <span className="label text-right">Proj</span>
          <span className="label text-right">ADP</span>
        </header>

        {players.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-dim">
            {q ? `No players match “${q}”.` : "No players cached yet — run the player sync."}
          </p>
        )}

        {players.map((p) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className={`grid ${GRID} border-t border-seam-soft px-4 py-2.5 transition-colors first:border-t-0 hover:bg-surface-raised`}
          >
            <span
              className="tabular-score text-[11px]"
              style={{ color: positionColor(p.position) }}
            >
              {p.pos_rank ? `${p.position}${p.pos_rank}` : p.position}
            </span>

            <span className="flex min-w-0 items-center gap-2.5">
              <PlayerAvatar
                playerId={p.id}
                name={p.full_name}
                position={p.position}
                team={p.team}
                size="sm"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{p.full_name}</span>
                <span className="font-data text-[10px] text-ink-faint">
                  {p.team ?? "FA"}
                  {p.years_exp === 0 ? " · Rookie" : ""}
                </span>
              </span>
            </span>

            <SeasonCell ppg={p.lastSeason?.ppg ?? p.ppg} games={p.lastSeason?.games_played ?? null} />
            <span className="hidden sm:block">
              <SeasonCell ppg={p.thisSeason?.ppg ?? null} games={p.thisSeason?.games_played ?? null} />
            </span>
            <SeasonCell ppg={p.proj_ppg} games={null} accent />
            <span className={`tabular-score text-right text-sm ${sort === "adp" ? "text-ink" : "text-ink-dim"}`}>
              {p.adp != null ? p.adp.toFixed(1) : "—"}
            </span>
          </Link>
        ))}
      </section>
    </Shell>
  );
}

function SeasonCell({
  ppg,
  games,
  accent,
}: {
  ppg: number | null;
  games: number | null;
  accent?: boolean;
}) {
  if (ppg === null) {
    return <span className="tabular-score text-right text-sm text-ink-faint">—</span>;
  }
  return (
    <span className="text-right">
      <span className={`tabular-score block text-sm ${accent ? "text-flare" : "text-ink"}`}>
        {ppg.toFixed(1)}
      </span>
      {games ? (
        <span className="block font-data text-[10px] text-ink-faint">{games}g</span>
      ) : null}
    </span>
  );
}
