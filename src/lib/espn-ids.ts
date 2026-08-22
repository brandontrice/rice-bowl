import type { SupabaseClient } from "@supabase/supabase-js";

const TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
const ROSTER_URL = (abbr: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`;

/** Strip punctuation and suffixes so "A.J. Brown" matches "AJ Brown". */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type RosterEntry = { id: string; team: string; position: string };

/**
 * Builds a name → ESPN athlete id map from all 32 current team rosters.
 *
 * Sleeper carries an `espn_id`, but only for about a fifth of the pool —
 * Ja'Marr Chase and Amon-Ra St. Brown are both missing one — so the news
 * lookup needs its own way to resolve the rest. Team rosters beat ESPN's
 * global athlete index here: they are current-season only, and matching
 * within a team keeps the two Josh Allens apart.
 */
async function buildRosterIndex(): Promise<Map<string, RosterEntry[]>> {
  const index = new Map<string, RosterEntry[]>();

  const teamsRes = await fetch(TEAMS_URL, { headers: { accept: "application/json" } });
  if (!teamsRes.ok) return index;
  const teamsJson = (await teamsRes.json()) as {
    sports?: { leagues?: { teams?: { team?: { abbreviation?: string } }[] }[] }[];
  };
  const abbrs = (teamsJson.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((t) => t.team?.abbreviation)
    .filter((a): a is string => Boolean(a));

  const rosters = await Promise.all(
    abbrs.map(async (abbr) => {
      // Firing 32 requests at once, a few come back empty; one retry is
      // enough to converge in a single run rather than over several days.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(ROSTER_URL(abbr.toLowerCase()), {
            headers: { accept: "application/json" },
          });
          if (!res.ok) continue;
          const json = (await res.json()) as {
            athletes?: {
              items?: { id?: string; fullName?: string; position?: { abbreviation?: string } }[];
            }[];
          };
          const athletes = (json.athletes ?? []).flatMap((group) => group.items ?? []);
          if (athletes.length > 0) return { abbr, athletes };
        } catch {
          // fall through to the retry
        }
      }
      return { abbr, athletes: [] };
    }),
  );

  for (const { abbr, athletes } of rosters) {
    for (const a of athletes) {
      if (!a.id || !a.fullName) continue;
      const key = normalizeName(a.fullName);
      const entry: RosterEntry = {
        id: a.id,
        team: abbr.toUpperCase(),
        position: a.position?.abbreviation ?? "",
      };
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
  }

  return index;
}

/**
 * Fills in `players.espn_id` wherever Sleeper left it null.
 *
 * Only touches rows that are missing one, so the 33 upstream requests are
 * paid once and then only for players who are genuinely new.
 */
export async function resolveMissingEspnIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ attempted: number; resolved: number }> {
  const { data: missing } = await supabase
    .from("players")
    .select("id, full_name, team, position")
    .is("espn_id", null)
    // Team defenses are not ESPN athletes and never will be.
    .neq("position", "DEF");

  const rows = (missing ?? []) as {
    id: string;
    full_name: string;
    team: string | null;
    position: string | null;
  }[];
  if (rows.length === 0) return { attempted: 0, resolved: 0 };

  const index = await buildRosterIndex();
  if (index.size === 0) return { attempted: rows.length, resolved: 0 };

  const updates: { id: string; espn_id: string }[] = [];
  for (const row of rows) {
    const candidates = index.get(normalizeName(row.full_name));
    if (!candidates || candidates.length === 0) continue;

    // Prefer the same team, then the same position, and only accept an
    // unqualified match when exactly one athlete carries that name.
    const match =
      candidates.find((c) => row.team && c.team === row.team) ??
      candidates.find((c) => row.position && c.position === row.position) ??
      (candidates.length === 1 ? candidates[0] : null);

    if (match) updates.push({ id: row.id, espn_id: match.id });
  }

  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await Promise.all(
      slice.map((u) => supabase.from("players").update({ espn_id: u.espn_id }).eq("id", u.id)),
    );
  }

  return { attempted: rows.length, resolved: updates.length };
}
