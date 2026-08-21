import Link from "next/link";
import { getCurrentManager } from "@/lib/data";
import { SignOutButton } from "@/components/SignOutButton";

export async function TopNav() {
  const manager = await getCurrentManager();

  return (
    <header className="sticky top-0 z-10 border-b border-canvas-border/80 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-display text-xl uppercase tracking-wide text-canvas-fg">
          Rice Bowl
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-xs uppercase tracking-wide text-canvas-muted hover:text-canvas-fg">
            Matchup
          </Link>
          <Link href="/season" className="text-xs uppercase tracking-wide text-canvas-muted hover:text-canvas-fg">
            Season
          </Link>
          {manager && (
            <span
              className="hidden h-2 w-2 rounded-full sm:inline-block"
              style={{ backgroundColor: manager.accent_color }}
              title={manager.display_name}
            />
          )}
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
