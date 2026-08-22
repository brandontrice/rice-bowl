import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerDetail, type SeasonLine, type WeekLine } from "@/lib/player-browser";
import { fetchPlayerNews } from "@/lib/player-news";
import { positionColor } from "@/lib/rule-style";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Panel } from "@/components/ui/Panel";
import { Shell } from "@/components/ui/Shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const detail = await getPlayerDetail(playerId);
  return { title: detail?.player.full_name ?? "Player" };
}

/** The stat keys worth showing per position, in reading order. */
const STAT_COLUMNS: Record<string, [string, string][]> = {
  QB: [
    ["pass_yd", "PaYd"],
    ["pass_td", "PaTD"],
    ["pass_int", "INT"],
    ["rush_yd", "RuYd"],
    ["rush_td", "RuTD"],
  ],
  RB: [
    ["rush_yd", "RuYd"],
    ["rush_td", "RuTD"],
    ["rec", "Rec"],
    ["rec_yd", "ReYd"],
    ["rec_td", "ReTD"],
  ],
  WR: [
    ["rec", "Rec"],
    ["rec_yd", "ReYd"],
    ["rec_td", "ReTD"],
    ["rush_yd", "RuYd"],
    ["rush_td", "RuTD"],
  ],
  TE: [
    ["rec", "Rec"],
    ["rec_yd", "ReYd"],
    ["rec_td", "ReTD"],
    ["fum_lost", "FL"],
    ["rush_yd", "RuYd"],
  ],
  DEF: [
    ["def_st_td", "TD"],
    ["sack", "Sack"],
    ["int", "INT"],
    ["fum_rec", "FR"],
    ["pts_allow", "PA"],
  ],
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const detail = await getPlayerDetail(playerId);
  if (!detail) notFound();

  const { player, seasons, lastSeason, thisSeason, weeks, logSeason, projection } = detail;
  const news = await fetchPlayerNews(player.espn_id);
  const columns = STAT_COLUMNS[player.position ?? ""] ?? STAT_COLUMNS.RB;
  const color = positionColor(player.position);

  return (
    <Shell>
      <Link href="/players" className="font-data text-[11px] text-ink-dim hover:text-ink">
        ← All players
      </Link>

      <header className="flex items-center gap-4">
        <PlayerAvatar
          playerId={player.id}
          name={player.full_name}
          position={player.position}
          team={player.team}
          size="lg"
        />
        <div className="min-w-0">
          <h1 className="font-display text-4xl uppercase leading-none text-ink">
            {player.full_name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 font-data text-[11px] text-ink-faint">
            <span style={{ color }}>
              {player.pos_rank ? `${player.position}${player.pos_rank}` : player.position}
            </span>
            <span>{player.team ?? "Free agent"}</span>
            {typeof player.years_exp === "number" && (
              <span>{player.years_exp === 0 ? "Rookie" : `${player.years_exp}y exp`}</span>
            )}
            {player.status && player.status !== "Active" && (
              <span className="text-crimson">{player.status}</span>
            )}
            {projection?.adp != null && (
              <span
                className="rounded-full border px-2 py-0.5"
                style={{
                  color,
                  borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                }}
                title={`Average draft position across Sleeper leagues, ${seasons.current}`}
              >
                ADP {projection.adp.toFixed(1)}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SeasonCard title={`${seasons.previous} actual`} line={lastSeason} fallbackPpg={player.ppg} />
        <SeasonCard
          title={`${seasons.current} to date`}
          line={thisSeason}
          emptyNote="Nothing logged yet this season."
        />
        <SeasonCard
          title={`${seasons.current} projected`}
          line={
            projection
              ? {
                  season: projection.season,
                  ppg: projection.ppg,
                  points: projection.points,
                  games_played: null,
                }
              : null
          }
          accent={color}
          emptyNote="No projection published."
        />
      </div>

      <Panel
        title={`${logSeason} game log`}
        action={
          logSeason !== seasons.current ? (
            <span className="font-data text-[10px] uppercase tracking-[0.1em] text-flare">
              Last season
            </span>
          ) : undefined
        }
        bodyClassName="p-0"
      >
        {weeks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-dim">
            No games played yet. This fills in as the season runs — during games it updates
            alongside the matchup scores.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-seam-soft">
                  <th className="label px-4 py-2 text-left">Wk</th>
                  {columns.map(([, label]) => (
                    <th key={label} className="label px-2 py-2 text-right">
                      {label}
                    </th>
                  ))}
                  <th className="label px-4 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <GameLogRow key={w.week} week={w} columns={columns} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Recent news"
        action={
          news.items.length > 0 ? (
            <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              via ESPN
            </span>
          ) : undefined
        }
        bodyClassName="flex flex-col gap-3"
      >
        {news.note && (
          <div className="rounded-xl border-l-2 bg-ground px-3.5 py-3" style={{ borderLeftColor: color }}>
            <p className="text-sm font-semibold text-ink">{news.note.headline}</p>
            <p className="mt-1 text-sm text-ink-dim">{news.note.body}</p>
            {news.note.published && (
              <p className="mt-1.5 font-data text-[10px] text-ink-faint">
                {formatDate(news.note.published)}
              </p>
            )}
          </div>
        )}

        {news.items.length === 0 && !news.note ? (
          <p className="text-sm text-ink-dim">
            {player.espn_id
              ? "No recent stories for this player."
              : "No news source linked for this player."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-seam-soft">
            {news.items.map((item, i) => (
              <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                <a
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-ink hover:text-accent"
                >
                  {item.headline}
                </a>
                {item.published && (
                  <p className="mt-0.5 font-data text-[10px] text-ink-faint">
                    {formatDate(item.published)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Shell>
  );
}

function SeasonCard({
  title,
  line,
  fallbackPpg,
  emptyNote,
  accent,
}: {
  title: string;
  line: SeasonLine | null;
  fallbackPpg?: number | null;
  emptyNote?: string;
  accent?: string;
}) {
  const ppg = line?.ppg ?? fallbackPpg ?? null;
  const games = line?.games_played ?? null;
  const points = line?.points ?? null;

  return (
    <section className="rounded-2xl border border-seam bg-surface p-4">
      <h2 className="label">{title}</h2>
      {ppg === null ? (
        <p className="mt-3 text-sm text-ink-dim">{emptyNote ?? "No production recorded."}</p>
      ) : (
        <>
          <p
            className="tabular-score mt-2 text-4xl font-semibold leading-none"
            style={{ color: accent ?? "var(--ink)" }}
          >
            {ppg.toFixed(1)}
            <span className="ml-1.5 font-data text-[11px] font-normal text-ink-faint">PPG</span>
          </p>
          <p className="mt-2 font-data text-[11px] text-ink-faint">
            {points !== null ? `${Number(points).toFixed(1)} total` : "—"}
            {games ? ` · ${games} game${games === 1 ? "" : "s"}` : ""}
          </p>
        </>
      )}
    </section>
  );
}

function GameLogRow({ week, columns }: { week: WeekLine; columns: [string, string][] }) {
  const played = Number(week.stats?.gp ?? 0) > 0;
  return (
    <tr className="border-b border-seam-soft last:border-b-0">
      <td className="px-4 py-2 font-data text-[11px] text-ink-faint">{week.week}</td>
      {columns.map(([key]) => (
        <td key={key} className="tabular-score px-2 py-2 text-right text-ink-dim">
          {played ? (week.stats?.[key] ?? 0) : "—"}
        </td>
      ))}
      <td className="tabular-score px-4 py-2 text-right font-semibold text-ink">
        {week.points !== null ? Number(week.points).toFixed(1) : "—"}
      </td>
    </tr>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
