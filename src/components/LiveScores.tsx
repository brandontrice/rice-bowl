"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Base gap between score refreshes while someone is watching. */
const POLL_MS = 90_000;
/** Spread so two open tabs don't fire the same request in lockstep. */
const JITTER_MS = 15_000;

/**
 * Keeps the matchup page live, two ways.
 *
 * Realtime: any change to this week's scores refreshes both managers'
 * pages, so they watch the same number move at the same time.
 *
 * Polling: Vercel's Hobby plan allows only one cron run per day, so the
 * server cannot pull Sleeper every fifteen minutes. It does not need to —
 * scores only matter while someone is looking at them. An open, visible
 * tab asks the scoring endpoint to refresh on an interval; whichever tab
 * gets there first writes, and Realtime fans the result out to the other.
 * A backgrounded tab stops entirely rather than burning requests.
 */
export function LiveScores({ weekId, live }: { weekId: string; live: boolean }) {
  const router = useRouter();
  const inFlight = useRef(false);

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

  useEffect(() => {
    if (!live) return;

    let timer: number | undefined;

    async function refresh() {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/score/${weekId}`, { method: "POST" });
        // 409 just means the draft isn't finished — nothing to report, and
        // no reason to stop polling.
        if (res.ok) router.refresh();
      } catch {
        // Offline or the request was cut short. The next tick retries.
      } finally {
        inFlight.current = false;
      }
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, POLL_MS + Math.random() * JITTER_MS);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
        schedule();
      } else {
        window.clearTimeout(timer);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, live]);

  return null;
}
