"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 700;

/**
 * Counts to a new value when it changes while mounted — which is exactly
 * the case that matters: a score refresh landing over Realtime. It does
 * not animate on first paint, because counting up from zero on every page
 * load is noise rather than a moment.
 */
export function AnimatedNumber({
  value,
  digits = 1,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Still asynchronous: setting state synchronously inside an effect
      // triggers a cascading render.
      frame.current = requestAnimationFrame(() => setShown(value));
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // ease-out cubic — fast off the mark, settles gently on the number
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <span className={className}>{shown.toFixed(digits)}</span>;
}
