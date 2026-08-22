import Link from "next/link";
import { HOUSE_RULES } from "@/lib/house-rules";
import { DeckGrid } from "@/components/DeckGrid";
import { HouseMark } from "@/components/ui/HouseMark";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { Shell } from "@/components/ui/Shell";

/**
 * Between seasons, and during the preseason and the playoffs.
 *
 * The league only plays weeks 1 through 18, so there is nothing to draft
 * and nothing to score — but the app is still worth opening. Everything
 * that reads the NFL rather than the rivalry keeps working: the schedule,
 * the player rankings with last season's production and this year's
 * projections, and the deck.
 */
export function Preseason({
  season,
  seasonType,
  kickoffAt,
}: {
  season: number;
  seasonType: string;
  kickoffAt: string | null;
}) {
  const playoffs = seasonType === "post";

  return (
    <Shell width="wide">
      <header className="flex flex-col items-center gap-5 py-10 text-center sm:py-14">
        <span className="text-accent">
          <HouseMark size={68} animated />
        </span>

        <h1 className="font-display text-5xl uppercase leading-[0.85] text-ink sm:text-7xl">
          {playoffs ? "Season complete" : "Preseason"}
        </h1>

        <p className="max-w-md text-base text-ink-dim">
          {playoffs
            ? `The ${season} regular season is done. The house is closed until next year's Week 1.`
            : `The house opens in Week 1. Preseason football doesn't count here — starters sit after a series, and a rivalry shouldn't turn on a third-string running back.`}
        </p>

        {kickoffAt && !playoffs && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-seam bg-surface px-6 py-4">
            <span className="label">First kickoff</span>
            <span className="font-display text-2xl uppercase text-ink">
              {new Date(kickoffAt).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <KickoffCountdown locksAt={kickoffAt} drafted />
          </div>
        )}

        <nav className="flex flex-wrap justify-center gap-2">
          {[
            { href: "/schedule", label: "Schedule" },
            { href: "/players", label: "Players" },
            { href: "/deck", label: "The Deck" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="lift rounded-full border border-seam px-4 py-2 font-data text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="max-w-md text-xs text-ink-faint">
          Stats and the schedule keep updating through the preseason — only the drafting waits.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-3xl uppercase text-ink">The Deck</h2>
          <p className="font-data text-[11px] text-ink-faint">
            {HOUSE_RULES.length} cards · one gets dealt every week
          </p>
        </div>
        <DeckGrid />
      </div>
    </Shell>
  );
}
