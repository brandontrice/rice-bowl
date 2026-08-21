import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { Panel } from "@/components/ui/Panel";
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
    <Panel
      title="The League"
      action={
        <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {managers.length}/{allowlist.length} in
        </span>
      }
      bodyClassName="flex flex-col gap-2"
    >
      {allowlist.map((entry) => {
        const manager = managerByEmail.get(entry.email);

        if (manager) {
          return (
            <div
              key={entry.email}
              className="flex items-center gap-3 rounded-xl border-l-2 bg-ground px-3.5 py-3"
              style={{ borderLeftColor: manager.accent_color }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: manager.accent_color }}
              />
              <span className="truncate text-sm font-semibold text-ink">
                {manager.display_name}
              </span>
              <span className="ml-auto shrink-0 font-data text-[10px] uppercase tracking-[0.1em] text-jade">
                Confirmed
              </span>
            </div>
          );
        }

        return (
          <div
            key={entry.email}
            className="flex flex-col gap-3 rounded-xl border border-dashed border-seam bg-ground px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink-faint" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{entry.display_name}</p>
                <p className="truncate font-data text-[11px] text-ink-faint">{entry.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
              <CopyButton value={entry.email} label="Copy email" />
              <Link
                href="/login"
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ground transition hover:opacity-90"
              >
                Sign up →
              </Link>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
