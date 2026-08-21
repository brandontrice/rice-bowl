import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentWeek } from "@/lib/ensure-week";
import { getCurrentManager, getManagers, getManagerAllowlist } from "@/lib/data";
import { LeagueRollCall } from "@/components/LeagueRollCall";
import { DeckGrid } from "@/components/DeckGrid";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Shell } from "@/components/ui/Shell";
import { HOUSE_RULES } from "@/lib/house-rules";

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
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <h1 className="font-display text-5xl uppercase text-ink">Hang tight</h1>
            <p className="max-w-sm text-sm text-ink-dim">
              The league starts as soon as both managers have signed up. This page updates itself —
              no need to refresh.
            </p>
          </div>
          <LeagueRollCall allowlist={allowlist} managers={managers} />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl uppercase text-ink">The Deck</h2>
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

  if (!result.week) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <h1 className="font-display text-4xl uppercase text-ink">Hang tight</h1>
        <p className="text-sm text-ink-dim">{result.error}</p>
      </div>
    );
  }

  redirect(`/week/${result.week.id}`);
}
