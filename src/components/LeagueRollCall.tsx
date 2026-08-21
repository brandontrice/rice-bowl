import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import type { Manager, ManagerAllowlistEntry } from "@/types/database";

export function LeagueRollCall({
  allowlist,
  managers,
}: {
  allowlist: ManagerAllowlistEntry[];
  managers: Manager[];
}) {
  const managerByEmail = new Map(managers.map((m) => [m.email, m]));

  return (
    <div className="rounded-2xl border border-seam bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-dim">
        The League
      </h3>
      <div className="flex flex-col gap-2">
        {allowlist.map((entry) => {
          const manager = managerByEmail.get(entry.email);
          if (manager) {
            return (
              <div
                key={entry.email}
                className="flex items-center gap-3 rounded-xl border border-seam/70 bg-ground p-3"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: manager.accent_color }}
                />
                <span className="text-sm font-semibold text-ink">{manager.display_name}</span>
                <span className="ml-auto text-xs font-medium text-jade">Confirmed</span>
              </div>
            );
          }
          return (
            <div
              key={entry.email}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-seam/70 bg-ground p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full border border-ink-dim" />
                <div>
                  <p className="text-sm font-semibold text-ink">{entry.display_name}</p>
                  <p className="text-xs text-ink-dim">{entry.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-6 sm:pl-0">
                <CopyButton value={entry.email} label="Copy email" />
                <Link
                  href="/login"
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                >
                  Sign up →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
