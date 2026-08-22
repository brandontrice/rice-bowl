import type { Metadata } from "next";
import Link from "next/link";
import { listRankedPlayers } from "@/lib/player-browser";
import { BROWSABLE_POSITIONS } from "@/lib/positions";
import { positionColor } from "@/lib/rule-style";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PlayerFilters } from "@/components/PlayerFilters";
import { Shell } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "Players" };

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string; q?: string }>;
}) {
  const { pos, q } = await searchParams;
  const position = pos && BROWSABLE_POSITIONS.includes(pos as never) ? pos : "ALL";
  const { players, seasons } = await listRankedPlayers({ position, search: q });

  return (
    <Shell width="wide">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl uppercase text-ink">Players</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Ranked by {seasons.previous} points per game. This season fills in beside it as games
            are played.
          </p>
        </div>
        <span className="font-data text-[11px] text-ink-faint">
          {players.length} shown
        </span>
      </header>

      <PlayerFilters position={position} search={q ?? ""} />

      <section className="overflow-hidden rounded-2xl border border-seam bg-surface">
        <header className="grid grid-cols-[46px_minmax(0,1fr)_66px_66px] items-center gap-3 border-b border-seam-soft px-4 py-2.5 sm:grid-cols-[46px_minmax(0,1fr)_88px_88px]">
          <span className="label">Rank</span>
          <span className="label">Player</span>
          <span className="label text-right">{seasons.previous}</span>
          <span className="label text-right">{seasons.current}</span>
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
            className="grid grid-cols-[46px_minmax(0,1fr)_66px_66px] items-center gap-3 border-t border-seam-soft px-4 py-2.5 transition-colors first:border-t-0 hover:bg-surface-raised sm:grid-cols-[46px_minmax(0,1fr)_88px_88px]"
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
            <SeasonCell ppg={p.thisSeason?.ppg ?? null} games={p.thisSeason?.games_played ?? null} />
          </Link>
        ))}
      </section>
    </Shell>
  );
}

function SeasonCell({ ppg, games }: { ppg: number | null; games: number | null }) {
  if (ppg === null) {
    return <span className="tabular-score text-right text-sm text-ink-faint">—</span>;
  }
  return (
    <span className="text-right">
      <span className="tabular-score block text-sm text-ink">{ppg.toFixed(1)}</span>
      {games ? (
        <span className="font-data text-[10px] text-ink-faint">{games}g</span>
      ) : null}
    </span>
  );
}
