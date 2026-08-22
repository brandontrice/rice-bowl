import { HOUSE_RULES } from "@/lib/house-rules";
import { RULE_STYLE } from "@/lib/rule-style";
import { RuleEmblem } from "@/components/RuleEmblem";

/**
 * The deck, as a deck. This was a flat accordion of twenty one-liners —
 * the card metaphor lived in the copy and nowhere in the pixels.
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
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {HOUSE_RULES.map((rule, i) => {
          const style = RULE_STYLE[rule.enforcement];
          const dealtWeek = dealtByKey?.get(rule.key);
          const isDealt = dealtWeek !== undefined;

          return (
            <article
              key={rule.key}
              className="lift animate-rise relative flex min-h-[132px] flex-col gap-1.5 overflow-hidden rounded-xl border bg-surface p-3.5"
              style={{
                // Staggered so the deck deals itself in rather than landing
                // all at once, capped so the last card isn't still arriving
                // a second later.
                animationDelay: `${Math.min(i * 22, 420)}ms`,
                borderColor: isDealt
                  ? `color-mix(in srgb, ${style.color} 60%, transparent)`
                  : "var(--seam)",
                backgroundImage: isDealt
                  ? `radial-gradient(100% 120% at 90% -10%, color-mix(in srgb, ${style.color} 12%, transparent), transparent 60%)`
                  : undefined,
              }}
            >
              {/* The emblem sits large and low-contrast behind the card, so
                  the deck reads as a set of faces at a glance without the
                  glyph competing with the rule's name. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-3 -right-2 opacity-[0.13]"
                style={{ color: style.color }}
              >
                <RuleEmblem ruleKey={rule.key} size={82} />
              </span>

              {/* The emblem gets real size rather than sitting inline with
                  the label — at 13px the busier glyphs are mud. */}
              <span
                className="relative flex items-start justify-between gap-2"
                style={{ color: style.color }}
              >
                <RuleEmblem ruleKey={rule.key} size={26} />
                <span className="font-data text-[9px] uppercase tracking-[0.12em]">
                  {style.label}
                </span>
              </span>
              <h3 className="relative font-display text-xl uppercase leading-none text-ink">
                {rule.name}
              </h3>
              <p className="relative text-xs text-ink-dim">{rule.tagline}</p>
              <p className="relative mt-auto pr-12 text-[11px] leading-snug text-ink-faint">
                {rule.description}
              </p>
              {isDealt && (
                <span className="absolute bottom-2.5 right-3 font-data text-[9px] tracking-wide text-ink-faint">
                  WK {dealtWeek}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
