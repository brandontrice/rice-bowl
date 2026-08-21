"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the matchup page in sync as scores land, so both managers watch the
 * same number move at the same time. weekly_scores was not in the Realtime
 * publication before migration 0003, so this could not have worked.
 */
export function LiveScores({ weekId }: { weekId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`scores-${weekId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_scores", filter: `week_id=eq.${weekId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "weeks", filter: `id=eq.${weekId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId]);

  return null;
}
