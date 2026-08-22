"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BROWSABLE_POSITIONS } from "@/lib/positions";

const TABS = ["ALL", ...BROWSABLE_POSITIONS] as const;

const SORTS = [
  { value: "adp", label: "ADP" },
  { value: "proj", label: "Projected" },
  { value: "last", label: "Last season" },
] as const;

/** Position tabs and a debounced search box, both held in the URL. */
export function PlayerFilters({
  position,
  search,
  sort,
}: {
  position: string;
  search: string;
  sort: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(search);

  // Debounced so typing doesn't fire a server round-trip per keystroke.
  useEffect(() => {
    if (term === search) return;
    const id = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (term.trim()) next.set("q", term.trim());
      else next.delete("q");
      router.replace(`/players?${next.toString()}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function hrefFor(pos: string) {
    const next = new URLSearchParams(params.toString());
    if (pos === "ALL") next.delete("pos");
    else next.set("pos", pos);
    return `/players?${next.toString()}`;
  }

  function sortHref(next: string) {
    const params2 = new URLSearchParams(params.toString());
    if (next === "last") params2.delete("sort");
    else params2.set("sort", next);
    return `/players?${params2.toString()}`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Sort first: on a draft weekend "who goes next" is the question, and
          that is ADP, not last season's box scores. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Order by</span>
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => router.replace(sortHref(s.value), { scroll: false })}
            aria-pressed={sort === s.value}
            className={`shrink-0 rounded-full border px-3 py-1 font-data text-[11px] tracking-wide transition-colors ${
              sort === s.value
                ? "border-accent bg-accent font-semibold text-ground"
                : "border-seam text-ink-dim hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => router.replace(hrefFor(tab), { scroll: false })}
            aria-pressed={position === tab}
            className={`shrink-0 rounded-full border px-3 py-1 font-data text-[11px] tracking-wide transition-colors ${
              position === tab
                ? "border-accent bg-accent font-semibold text-ground"
                : "border-seam text-ink-dim hover:text-ink"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search players…"
        aria-label="Search players"
        className="w-full rounded-lg border border-seam bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent sm:ml-auto sm:max-w-xs"
      />
      </div>
    </div>
  );
}
