/**
 * When the week actually locks.
 *
 * The league's rule is that the draft is finished before Thursday's games
 * start, so the deadline is the first kickoff of the NFL week — not a
 * fixed "Thursday 8:15pm", which is wrong on Thanksgiving weeks, on the
 * international games that kick off Sunday morning, and in Week 18 where
 * the schedule moves around entirely.
 *
 * Sleeper's schedule endpoint carries dates but no kick times, so this
 * comes from ESPN's scoreboard, which has the full datetime per game.
 */
const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function fetchWeekKickoff(
  season: number,
  week: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SCOREBOARD}?seasontype=2&week=${week}&dates=${season}`,
      { headers: { accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as { events?: { date?: string }[] };
    const dates = (json.events ?? [])
      .map((e) => e.date)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);

    return dates.length > 0 ? new Date(dates[0]).toISOString() : null;
  } catch {
    return null;
  }
}
