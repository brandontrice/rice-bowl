import { HOUSE_RULES, type HouseRuleEnforcement } from "@/lib/house-rules";
import { RULE_STYLE } from "@/lib/rule-style";
import { RuleEmblem } from "@/components/RuleEmblem";

/** Reading order for the deck: what the rule touches, roughly in the order
 *  a week touches it — how you score, then who you can draft, then who you
 *  must roster, then the draft itself, then the honour rules. */
const GROUP_ORDER: HouseRuleEnforcement[] = [
  "scoring",
  "draft-pool",
  "roster-constraint",
  "draft-order",
  "visibility",
  "honor",
];

/**
 * The deck, as a deck.
 *
 * Grouped by category rather than run together. The rules happen to be
 * declared with all eight scoring cards first, so an ungrouped grid opens
 * with eight identically-labelled yellow cards and the colour coding reads
 * as monotony instead of information. Banding them makes the same colour
 * mean something: a section, not a coincidence.
 *
 * `dealtByKey` marks cards already played this season, so the deck doubles
 * as a record of the year.
 */
export function DeckGrid({
  dealtByKey,
  className,
}: {
  dealtByKey?: Map<string, number>;
  className?: string;
}) {
  const groups = GROUP_ORDER.map((enforcement) => ({
    enforcement,
    style: RULE_STYLE[enforcement],
    rules: HOUSE_RULES.filter((r) => r.enforcement === enforcement),
  })).filter((g) => g.rules.length > 0);

  let index = 0;

  return (
    <div className={className}>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.enforcement} className="flex flex-col gap-2.5">
            <header className="flex items-center gap-3">
              <span
                className="flex items-center gap-2 font-data text-[10px] uppercase tracking-[0.14em]"
                style={{ color: group.style.color }}
              >
                <RuleEmblem ruleKey={group.rules[0].key} size={14} />
                {group.style.label}
              </span>
              <span
                className="h-px flex-1"
                style={{
                  backgroundColor: `color-mix(in srgb, ${group.style.color} 26%, transparent)`,
                }}
              />
              <span className="font-data text-[10px] text-ink-faint">
                {group.rules.length}
              </span>
            </header>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.rules.map((rule) => {
                const style = group.style;
                const dealtWeek = dealtByKey?.get(rule.key);
                const isDealt = dealtWeek !== undefined;
                // Stagger runs across the whole deck, not per group, so it
                // still deals as one sweep top to bottom.
                const delay = Math.min(index++ * 22, 460);

                return (
                  <article
                    key={rule.key}
                    className="lift animate-rise relative flex min-h-[132px] flex-col gap-1.5 overflow-hidden rounded-xl border bg-surface p-3.5"
                    style={{
                      animationDelay: `${delay}ms`,
                      borderColor: isDealt
                        ? `color-mix(in srgb, ${style.color} 60%, transparent)`
                        : "var(--seam)",
                      backgroundImage: isDealt
                        ? `radial-gradient(100% 120% at 90% -10%, color-mix(in srgb, ${style.color} 12%, transparent), transparent 60%)`
                        : undefined,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-3 -right-2 opacity-[0.13]"
                      style={{ color: style.color }}
                    >
                      <RuleEmblem ruleKey={rule.key} size={82} />
                    </span>

                    <span className="relative" style={{ color: style.color }}>
                      <RuleEmblem ruleKey={rule.key} size={26} />
                    </span>

                    <h3 className="relative font-display text-xl uppercase leading-none text-ink">
                      {rule.name}
                    </h3>
                    <p className="relative text-xs text-ink-dim">{rule.tagline}</p>
                    <p className="relative mt-auto pr-12 text-[11px] leading-snug text-ink-faint">
                      {rule.description}
                    </p>

                    {isDealt && (
                      <span
                        className="absolute bottom-2.5 right-3 rounded-full px-2 py-0.5 font-data text-[9px] tracking-wide"
                        style={{
                          color: style.color,
                          backgroundColor: `color-mix(in srgb, ${style.color} 16%, transparent)`,
                        }}
                      >
                        WK {dealtWeek}
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
