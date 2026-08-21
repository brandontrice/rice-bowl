import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { HOUSE_RULES } from "@/lib/house-rules";
import { DeckGrid } from "@/components/DeckGrid";
import { Shell } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "The Deck" };

export default async function DeckPage() {
  const supabase = await createClient();

  // Which cards have already been played this season. Not fatal if the
  // query fails or nobody has signed in yet — the deck still renders.
  const { data: weeks } = await supabase
    .from("weeks")
    .select("house_rule_key, week_number")
    .order("week_number", { ascending: true });

  const dealtByKey = new Map<string, number>();
  for (const w of weeks ?? []) {
    if (!dealtByKey.has(w.house_rule_key)) dealtByKey.set(w.house_rule_key, w.week_number);
  }

  const remaining = HOUSE_RULES.length - dealtByKey.size;

  return (
    <Shell width="wide">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl uppercase text-ink">The Deck</h1>
        <p className="font-data text-[11px] text-ink-faint">
          {HOUSE_RULES.length} cards · {remaining} not yet dealt this season
        </p>
      </header>
      <p className="max-w-prose text-sm text-ink-dim">
        One card is dealt every week and cannot be re-rolled. The colour is the
        category — scoring, pool, roster, draft order, visibility — and it stays
        the same everywhere the rule appears.
      </p>
      <DeckGrid dealtByKey={dealtByKey} />
    </Shell>
  );
}
