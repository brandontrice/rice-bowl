import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentWeek } from "@/lib/ensure-week";
import { getCurrentManager, getManagers, getManagerAllowlist } from "@/lib/data";
import { LeagueRollCall } from "@/components/LeagueRollCall";
import { HouseRulesDeckBrowser } from "@/components/HouseRulesDeckBrowser";
import { WaitingRoom } from "@/components/WaitingRoom";

export default async function Home() {
  const manager = await getCurrentManager();
  if (!manager) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-4xl uppercase text-canvas-fg">Not on the roster</h1>
        <p className="max-w-sm text-sm text-canvas-muted">
          You&apos;re signed in, but this email isn&apos;t on the league&apos;s manager allowlist yet.
          Add it in Supabase (manager_allowlist) and sign in again.
        </p>
      </div>
    );
  }

  const managers = await getManagers();

  if (managers.length < 2) {
    const allowlist = await getManagerAllowlist();
    return (
      <WaitingRoom>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <h1 className="font-display text-4xl uppercase text-canvas-fg">Hang tight</h1>
            <p className="max-w-sm text-sm text-canvas-muted">
              The league starts as soon as both managers have signed up. This page updates itself —
              no need to refresh.
            </p>
          </div>
          <LeagueRollCall allowlist={allowlist} managers={managers} />
          <HouseRulesDeckBrowser />
        </div>
      </WaitingRoom>
    );
  }

  const supabase = await createClient();
  const result = await ensureCurrentWeek(supabase);

  if (!result.week) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-4xl uppercase text-canvas-fg">Hang tight</h1>
        <p className="max-w-sm text-sm text-canvas-muted">{result.error}</p>
      </div>
    );
  }

  redirect(`/week/${result.week.id}`);
}
