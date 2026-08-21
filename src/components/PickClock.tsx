"use client";

import { useEffect, useRef, useState } from "react";

const PICK_LENGTHS = [60, 90, 120, 180] as const;

/** How long after expiry the opponent's tab waits before stepping in. */
const OPPONENT_GRACE_MS = 3_000;

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The pick clock.
 *
 * Armed rather than always-on: there is no scheduled draft time in this
 * league, so a clock running from the moment a week is dealt would
 * auto-draft an absent manager's whole roster overnight. Either manager
 * starts it when they are both actually at the board.
 *
 * On expiry a browser asks the server to auto-draft. The manager on the
 * clock fires immediately; the opponent waits a few seconds and fires only
 * as a fallback, for when the on-clock manager has closed their tab. The
 * server refuses either call while time remains, so this is a convenience,
 * not the enforcement — `auto_pick()` is.
 */
export function PickClock({
  draftId,
  deadlineAt,
  pickSeconds,
  isMyTurn,
  onAutoPick,
}: {
  draftId: string;
  deadlineAt: string | null;
  pickSeconds: number;
  isMyTurn: boolean;
  onAutoPick: (message: string | null) => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number>(90);
  const [arming, setArming] = useState(false);
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    // With no deadline the component renders the arm control and never
    // reads `remaining`, so there is nothing to reset here.
    if (!deadlineAt) return;

    const target = new Date(deadlineAt).getTime();
    let frame: number | undefined;

    async function fire() {
      // Once per deadline, whatever the tick rate.
      if (firedFor.current === deadlineAt) return;
      firedFor.current = deadlineAt;
      try {
        const res = await fetch(`/api/draft/${draftId}/autopick`, { method: "POST" });
        const body = await res.json();
        if (res.ok) {
          onAutoPick(`Clock expired — ${body.playerName} drafted automatically.`);
        } else if (res.status !== 409) {
          // 409 means the other tab got there first, or time was left after
          // all. Neither is worth putting in front of anyone.
          onAutoPick(body.error ?? null);
        }
      } catch {
        // Offline. The next tick or the other manager's tab will retry.
      }
    }

    function tick() {
      const left = target - Date.now();
      setRemaining(left);
      if (left <= (isMyTurn ? 0 : -OPPONENT_GRACE_MS)) void fire();
      frame = window.setTimeout(tick, 250);
    }

    tick();
    return () => window.clearTimeout(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, draftId, isMyTurn]);

  async function arm() {
    setArming(true);
    onAutoPick(null);
    const res = await fetch(`/api/draft/${draftId}/clock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    });
    if (!res.ok) {
      const body = await res.json();
      onAutoPick(body.error ?? "Could not start the clock.");
    }
    setArming(false);
  }

  if (!deadlineAt) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="label">No clock</span>
        <select
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          aria-label="Seconds per pick"
          className="rounded-lg border border-seam bg-ground px-2 py-1 font-data text-xs text-ink"
        >
          {PICK_LENGTHS.map((s) => (
            <option key={s} value={s}>
              {s}s per pick
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={arm}
          disabled={arming}
          className="rounded-full border border-seam px-3 py-1 font-data text-[10px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
        >
          {arming ? "Starting…" : "Start the clock"}
        </button>
      </div>
    );
  }

  const left = remaining ?? 0;
  const expired = left <= 0;
  const urgent = left <= 15_000;

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <span
        className={`tabular-score text-2xl leading-none ${
          expired ? "text-ink-faint" : urgent ? "text-crimson" : "text-accent"
        }`}
        role="timer"
        aria-live="off"
      >
        {expired ? "0:00" : format(left)}
      </span>
      <span className="label">
        {expired ? "Auto-drafting…" : `${pickSeconds}s per pick`}
      </span>
    </div>
  );
}
