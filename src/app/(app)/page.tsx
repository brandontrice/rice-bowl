import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentWeek } from "@/lib/ensure-week";
import { getCurrentManager, getManagers, getManagerAllowlist } from "@/lib/data";
import { LeagueRollCall } from "@/components/LeagueRollCall";
import { DeckGrid } from "@/components/DeckGrid";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Shell } from "@/components/ui/Shell";
import { HOUSE_RULES } from "@/lib/house-rules";
import { HouseMark } from "@/components/ui/HouseMark";
import { Preseason } from "@/components/Preseason";

export default async function Home() {
  const manager = await getCurrentManager();
  if (!manager) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <h1 className="font-display text-4xl uppercase text-ink">Not on the roster</h1>
        <p className="text-sm text-ink-dim">
          You&apos;re signed in, but this email isn&apos;t on the league&apos;s manager allowlist
          yet. Add it in Supabase (manager_allowlist) and sign in again.
        </p>
      </div>
    );
  }

  const managers = await getManagers();

  if (managers.length < 2) {
    const allowlist = await getManagerAllowlist();
    return (
      <WaitingRoom>
        <Shell width="wide">
          {/* The front door — and the first thing the second manager ever
              sees, so it says what the league is rather than only that it
              hasn't started. */}
          <header className="flex flex-col items-center gap-5 py-10 text-center sm:py-14">
            <span className="text-accent">
              <HouseMark size={72} animated />
            </span>

            <h1 className="font-display text-6xl uppercase leading-[0.85] text-ink sm:text-8xl">
              Rice-Lay House
            </h1>

            <p className="max-w-md text-base text-ink-dim">
              Two managers. One rivalry. Rosters torn up and redrafted every week, under a House
              Rule dealt from the deck.
            </p>

            <dl className="mt-2 grid w-full max-w-xl grid-cols-3 gap-px overflow-hidden rounded-xl border border-seam bg-seam">
              {[
                { label: "Managers", value: `${managers.length}/${allowlist.length}` },
                { label: "House Rules", value: String(HOUSE_RULES.length) },
                { label: "Roster", value: "8 slots" },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-3 py-3">
                  <dt className="label">{stat.label}</dt>
                  <dd className="tabular-score mt-1 text-xl font-semibold text-ink">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="flex items-center gap-2 font-data text-[11px] uppercase tracking-[0.1em] text-ink-faint">
              <span className="animate-waiting h-1.5 w-1.5 rounded-full bg-accent" />
              Waiting on the second manager · this page updates itself
            </p>
          </header>

          <LeagueRollCall allowlist={allowlist} managers={managers} />
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-3xl uppercase text-ink">The Deck</h2>
              <p className="font-data text-[11px] text-ink-faint">
                {HOUSE_RULES.length} cards · one gets dealt every week
              </p>
            </div>
            <DeckGrid />
          </div>
        </Shell>
      </WaitingRoom>
    );
  }

  const supabase = await createClient();
  const result = await ensureCurrentWeek(supabase);

  if (result.status === "not-started") {
    const { data: opener } = await supabase
      .from("nfl_games")
      .select("kickoff_at")
      .eq("season", result.season)
      .eq("week", 1)
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return <Preseason season={result.season} seasonType={result.seasonType} kickoffAt={opener?.kickoff_at ?? null} />;
  }

  if (result.status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <h1 className="font-display text-4xl uppercase text-ink">Hang tight</h1>
        <p className="text-sm text-ink-dim">{result.error}</p>
      </div>
    );
  }

  redirect(`/week/${result.week.id}`);
}
