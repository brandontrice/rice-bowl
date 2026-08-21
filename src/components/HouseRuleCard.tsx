import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import type { Manager, Week } from "@/types/database";

const ENFORCEMENT_LABEL: Record<string, string> = {
  scoring: "Scoring modifier",
  "draft-pool": "Pool restriction",
  "roster-constraint": "Roster rule",
  "draft-order": "Draft order",
  visibility: "Draft visibility",
  honor: "Honor rule",
};

export function HouseRuleCard({
  week,
  sniperManager,
  compact = false,
}: {
  week: Pick<Week, "house_rule_key" | "locked_division" | "locked_conference" | "sniper_manager_id">;
  sniperManager?: Manager | null;
  compact?: boolean;
}) {
  const rule = HOUSE_RULE_BY_KEY[week.house_rule_key];
  if (!rule) return null;

  let extra: string | null = null;
  if (rule.key === "division_lockdown" && week.locked_division) {
    extra = `This week: ${week.locked_division}`;
  } else if (rule.key === "conference_clash" && week.locked_conference) {
    extra = `This week: ${week.locked_conference}`;
  } else if (rule.key === "sniper" && sniperManager) {
    extra = `The Sniper is ${sniperManager.display_name}`;
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-seam bg-gradient-to-br from-surface-raised to-surface p-5 shadow-lg ${compact ? "" : "sm:p-6"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-dim">
          This Week&apos;s House Rule
        </span>
        <span className="rounded-full border border-seam px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-dim">
          {ENFORCEMENT_LABEL[rule.enforcement]}
        </span>
      </div>
      <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-ink sm:text-4xl">
        {rule.name}
      </h2>
      <p className="mt-1 text-sm font-medium text-accent">{rule.tagline}</p>
      {!compact && <p className="mt-3 text-sm text-ink-dim">{rule.description}</p>}
      {extra && (
        <p className="mt-3 inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
          {extra}
        </p>
      )}
    </div>
  );
}
