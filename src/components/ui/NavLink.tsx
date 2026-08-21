"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Nav item with an active state — the old nav gave no indication of where you were. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" || pathname.startsWith("/week") : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 font-data text-[10px] uppercase tracking-[0.1em] transition-colors ${
        isActive ? "bg-surface-raised text-ink" : "text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
