/**
 * Date helpers for the NFL schedule.
 *
 * Kept free of server imports so client components can use them too —
 * `schedule-data.ts` reaches for the Supabase server client, and importing
 * from it drags `next/headers` into the browser bundle.
 *
 * Everything here works in US Eastern, because that is what the league
 * schedules in. Kickoffs are stored in UTC and a US night game is already
 * past midnight there, so the UTC date is the wrong day for roughly a
 * fifth of the season.
 */
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The YYYY-MM-DD the league considers a kickoff to fall on. */
export function easternDay(iso: string): string {
  return EASTERN_DAY.format(new Date(iso));
}

/**
 * Formats a day key for display. Parsed at UTC noon so the label cannot
 * slip a day in either direction whatever timezone renders it.
 */
export function formatDayKey(
  key: string,
  style: "long" | "short" = "long",
): string {
  if (key === "tbd") return "Date to be confirmed";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(
    undefined,
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric" }
      : { weekday: "short", month: "short", day: "numeric" },
  );
}
