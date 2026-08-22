"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The week's card, face down until you turn it over.
 *
 * The House Rule is dealt the moment Sleeper's week rolls on Tuesday, but
 * seeing it should be an act rather than a page load — it is the one
 * moment in a week that is pure ceremony, and it happens before anyone
 * drafts. Once turned it stays turned: the reveal is recorded per manager
 * on the server, so it survives a new tab, a new device, and a cleared
 * browser.
 *
 * The opponent's reveal is not waited on. Both managers turn their own
 * card whenever they arrive.
 */
export function RuleReveal({
  weekId,
  weekNumber,
  revealed,
  children,
}: {
  weekId: string;
  weekNumber: number;
  revealed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);

  // Derived rather than synced through an effect, so a card revealed on
  // another device is already face up on this one's first paint.
  const faceUp = revealed || flipped;

  async function reveal() {
    if (faceUp || saving) return;
    setSaving(true);
    // Flip immediately — the animation is the point, and a failed write
    // only means it asks again next visit.
    setFlipped(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // ignoreDuplicates keeps this an INSERT ... ON CONFLICT DO NOTHING.
      // A plain upsert would fall through to an UPDATE on a second call,
      // and week_reveals grants insert only — there is nothing to update
      // on a row that just records that a thing happened.
      await supabase
        .from("week_reveals")
        .upsert(
          { week_id: weekId, manager_id: user.id },
          { onConflict: "week_id,manager_id", ignoreDuplicates: true },
        );
    }
    setSaving(false);
    router.refresh();
  }

  if (faceUp) return <>{children}</>;

  return (
    <div className="flip-scene">
      <div className="flip-card" data-face="down">
        <button
          type="button"
          onClick={reveal}
          className="card-back card-sheen lift relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-seam px-6 py-14 text-center"
          aria-label={`Reveal the House Rule for week ${weekNumber}`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-1.5 rounded-xl border border-dashed border-seam"
          />
          <span className="label relative">Week {weekNumber}</span>
          <span className="font-display relative text-4xl uppercase text-ink sm:text-5xl">
            Your card is waiting
          </span>
          <span className="relative rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ground">
            Turn it over
          </span>
          <span className="relative max-w-sm text-xs text-ink-dim">
            Dealt Tuesday and locked in — it can&apos;t be re-rolled. Draft under it before
            Thursday&apos;s kickoff.
          </span>
        </button>
      </div>
    </div>
  );
}
