import Link from "next/link";
import { getCurrentManager } from "@/lib/data";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/ui/NavLink";
import { HouseMark } from "@/components/ui/HouseMark";

export async function TopNav() {
  const manager = await getCurrentManager();

  return (
    <header className="sticky top-0 z-20 border-b border-seam bg-ground/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 text-ink transition-opacity hover:opacity-80"
        >
          <span className="text-accent transition-transform duration-300 group-hover:-translate-y-0.5">
            <HouseMark size={26} />
          </span>
          <span className="font-display text-2xl uppercase tracking-wide">Rice-Lay House</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/">Matchup</NavLink>
          <NavLink href="/season">Season</NavLink>
          <NavLink href="/players">Players</NavLink>
          <NavLink href="/schedule">Schedule</NavLink>
          <NavLink href="/deck">Deck</NavLink>

          {manager && (
            <span
              className="ml-2 hidden items-center gap-2 rounded-full border border-seam py-1 pl-2 pr-3 sm:flex"
              title={manager.display_name}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: manager.accent_color }}
              />
              <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                {manager.display_name}
              </span>
            </span>
          )}
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
