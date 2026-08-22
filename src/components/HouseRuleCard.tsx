import { HOUSE_RULE_BY_KEY } from "@/lib/house-rules";
import { RULE_STYLE } from "@/lib/rule-style";
import { RuleEmblem } from "@/components/RuleEmblem";
import type { Manager, Week } from "@/types/database";

/**
 * The week's dealt card. This is the thing the whole game hangs on, so it
 * gets a treatment nothing else in the app has: a double rule inset like a
 * playing card, and a corner glow in the category's colour.
 */
export function HouseRuleCard({
  week,
  sniperManager,
  compact = false,
}: {
  week: Pick<
    Week,
    "week_number" | "house_rule_key" | "locked_division" | "locked_conference" | "sniper_manager_id"
  > & { week_number?: number };
  sniperManager?: Manager | null;
  compact?: boolean;
}) {
  const rule = HOUSE_RULE_BY_KEY[week.house_rule_key];
  if (!rule) return null;

  const style = RULE_STYLE[rule.enforcement];

  let extra: string | null = null;
  if (rule.key === "division_lockdown" && week.locked_division) {
    extra = `This week: ${week.locked_division}`;
  } else if (rule.key === "conference_clash" && week.locked_conference) {
    extra = `This week: ${week.locked_conference}`;
  } else if (rule.key === "sniper" && sniperManager) {
    extra = `The Sniper is ${sniperManager.display_name}`;
  }

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-seam bg-surface p-5 sm:p-6"
      style={{
        // Both layers live here rather than splitting the yard lines into a
        // class: an inline backgroundImage would replace the class's,
        // silently dropping the markings.
        backgroundImage: [
          `radial-gradient(120% 140% at 88% -20%, color-mix(in srgb, ${style.color} 16%, transparent), transparent 62%)`,
          "repeating-linear-gradient(90deg, color-mix(in srgb, var(--ink) 5%, transparent) 0 1px, transparent 1px 56px)",
        ].join(", "),
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-xl border border-seam-soft"
      />

      {/* The week's emblem, oversized and faint — the card should be
          recognisable across a room before the name is readable. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-4 opacity-[0.12]"
        style={{ color: style.color }}
      >
        <RuleEmblem ruleKey={rule.key} size={168} />
      </span>

      <div className="relative flex items-center justify-between gap-3">
        <span className="label">
          {week.week_number ? `Week ${week.week_number} · ` : ""}House Rule
        </span>
        <span
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-data text-[10px] uppercase tracking-[0.1em]"
          style={{
            color: style.color,
            borderColor: `color-mix(in srgb, ${style.color} 45%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${style.color} 10%, transparent)`,
          }}
        >
          <RuleEmblem ruleKey={rule.key} size={14} />
          {style.label}
        </span>
      </div>

      <h2 className="font-display relative mt-3 text-4xl uppercase text-ink sm:text-5xl">
        {rule.name}
      </h2>
      <p className="relative mt-1.5 text-sm font-medium sm:text-base" style={{ color: style.color }}>
        {rule.tagline}
      </p>
      {!compact && <p className="relative mt-3 text-sm text-ink-dim">{rule.description}</p>}

      {extra && (
        <p
          className="relative mt-4 inline-block rounded-full px-3 py-1 font-data text-[10px] uppercase tracking-[0.1em]"
          style={{
            color: style.color,
            backgroundColor: `color-mix(in srgb, ${style.color} 16%, transparent)`,
          }}
        >
          {extra}
        </p>
      )}
    </article>
  );
}
