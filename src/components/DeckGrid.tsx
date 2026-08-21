import { HOUSE_RULES } from "@/lib/house-rules";
import { RULE_STYLE } from "@/lib/rule-style";

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
        {HOUSE_RULES.map((rule) => {
          const style = RULE_STYLE[rule.enforcement];
          const dealtWeek = dealtByKey?.get(rule.key);
          const isDealt = dealtWeek !== undefined;

          return (
            <article
              key={rule.key}
              className="relative flex min-h-[132px] flex-col gap-1.5 overflow-hidden rounded-xl border bg-surface p-3.5"
              style={{
                borderColor: isDealt
                  ? `color-mix(in srgb, ${style.color} 60%, transparent)`
                  : "var(--seam)",
                backgroundImage: isDealt
                  ? `radial-gradient(100% 120% at 90% -10%, color-mix(in srgb, ${style.color} 12%, transparent), transparent 60%)`
                  : undefined,
              }}
            >
              <span
                className="font-data text-[9px] uppercase tracking-[0.12em]"
                style={{ color: style.color }}
              >
                {style.label}
              </span>
              <h3 className="font-display text-xl uppercase leading-none text-ink">{rule.name}</h3>
              <p className="text-xs text-ink-dim">{rule.tagline}</p>
              <p className="mt-auto pr-10 text-[11px] leading-snug text-ink-faint">
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
