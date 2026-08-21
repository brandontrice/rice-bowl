"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h1 className="font-display text-4xl uppercase text-ink">That didn&apos;t load</h1>
      <p className="text-sm text-ink-dim">
        Something broke on the way to this page. Trying again usually clears it — the league data
        itself is untouched.
      </p>
      {error.digest && (
        <p className="font-data text-[10px] tracking-widest text-ink-faint">
          REF {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={retry}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ground transition hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
