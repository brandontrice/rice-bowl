export type PlayerNewsItem = {
  headline: string;
  published: string | null;
  url: string | null;
  source: string;
};

export type PlayerNews = {
  /** Rotowire's latest fantasy note — the one that usually matters most. */
  note: { headline: string; body: string; published: string | null } | null;
  items: PlayerNewsItem[];
};

const EMPTY: PlayerNews = { note: null, items: [] };

type EspnOverview = {
  news?: {
    headline?: string;
    lastModified?: string;
    published?: string;
    links?: { web?: { href?: string } };
  }[];
  rotowire?: {
    headline?: string;
    story?: string;
    description?: string;
    published?: string;
  };
};

/**
 * Recent news for one player, from ESPN's athlete overview endpoint.
 *
 * Sleeper has no news API — it carries injury fields and a `news_updated`
 * timestamp, but no article text. ESPN's `news?playerId=` endpoint looks
 * like the answer and is not: it returns 200 and silently ignores the
 * filter, handing back the same league-wide feed for every player. The
 * `athletes/{id}/overview` endpoint is the one that is actually scoped to
 * a player.
 *
 * This is a best-effort extra. Any failure returns empty rather than
 * throwing, because a player page with no news is still a useful page.
 */
export async function fetchPlayerNews(espnId: string | null): Promise<PlayerNews> {
  if (!espnId) return EMPTY;

  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/overview`,
      { headers: { accept: "application/json" }, next: { revalidate: 900 } },
    );
    if (!res.ok) return EMPTY;

    const data = (await res.json()) as EspnOverview;

    const rw = data.rotowire;
    const note =
      rw?.headline && (rw.story || rw.description)
        ? {
            headline: rw.headline,
            body: rw.story ?? rw.description ?? "",
            published: rw.published ?? null,
          }
        : null;

    const items: PlayerNewsItem[] = (data.news ?? [])
      .filter((n) => n.headline)
      .slice(0, 8)
      .map((n) => ({
        headline: n.headline!,
        published: n.published ?? n.lastModified ?? null,
        url: n.links?.web?.href ?? null,
        source: "ESPN",
      }));

    return { note, items };
  } catch {
    return EMPTY;
  }
}
