"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Time until the week's first kickoff, which is the draft deadline.
 *
 * Rendered client-side on purpose: the server would have to pick a
 * timezone, and "Thursday 8:20 PM" means different things to two people
 * on a work trip. A countdown is the same number wherever you are.
 *
 * Ticks by the minute until the last hour, then by the second — a
 * per-second re-render three days out is wasted work.
 */
export function KickoffCountdown({
  locksAt,
  drafted,
}: {
  locksAt: string;
  drafted: boolean;
}) {
  const target = new Date(locksAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;

    let timer: number | undefined;
    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);
      timer = window.setTimeout(tick, left > 0 && left < 3_600_000 ? 1_000 : 60_000);
    };
    // Async so the first paint matches the server's, avoiding a hydration
    // mismatch on a value that is by definition different every render.
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [target]);

  if (!Number.isFinite(target) || remaining === null) return null;

  const kickoff = new Date(target).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  if (remaining <= 0) {
    return (
      <span
        className={`font-data text-[10px] uppercase tracking-[0.1em] ${
          drafted ? "text-ink-faint" : "text-crimson"
        }`}
      >
        {drafted ? "Kicked off" : "Past kickoff — draft is late"}
      </span>
    );
  }

  const { days, hours, minutes, seconds } = parts(remaining);
  const urgent = remaining < 6 * 3_600_000 && !drafted;

  return (
    <span
      className={`font-data text-[10px] uppercase tracking-[0.1em] ${
        urgent ? "text-crimson" : "text-ink-faint"
      }`}
      title={`First kickoff ${kickoff}`}
    >
      {drafted ? "Kickoff in " : "Draft locks in "}
      <span className="tabular-score">
        {days > 0
          ? `${days}d ${hours}h`
          : hours > 0
            ? `${hours}h ${minutes}m`
            : `${minutes}m ${String(seconds).padStart(2, "0")}s`}
      </span>
    </span>
  );
}
