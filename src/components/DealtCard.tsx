"use client";

import { useEffect, useState } from "react";

/**
 * Plays the deal animation the first time a manager sees a given week's
 * card, and never again. The House Rule is deterministically seeded and
 * cannot be re-rolled, so the animation should feel equally final —
 * replaying it on every navigation would cheapen it.
 *
 * sessionStorage is per-tab and can throw in restricted contexts, so a
 * failure here just means the card renders without the flourish.
 */
export function DealtCard({ weekId, children }: { weekId: string; children: React.ReactNode }) {
  const [deal, setDeal] = useState(false);

  useEffect(() => {
    const key = `rice-bowl:dealt:${weekId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage unavailable — skip the animation rather than replaying it
      return;
    }
    const id = requestAnimationFrame(() => setDeal(true));
    return () => cancelAnimationFrame(id);
  }, [weekId]);

  return <div className={deal ? "animate-deal" : undefined}>{children}</div>;
}
