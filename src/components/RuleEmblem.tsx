import type { JSX } from "react";

/**
 * A glyph per House Rule.
 *
 * Hand-drawn as inline SVG rather than pulled from an icon set: half of
 * these ideas ("only one division is in play", "steal a pick", "your TE
 * scores double") have no stock equivalent, and a set assembled from
 * near-misses reads worse than a small consistent one drawn on purpose.
 *
 * All share a 24×24 box, a 1.6 stroke, round caps, and `currentColor`, so
 * they inherit the rule's category colour wherever they're placed.
 */
const GLYPHS: Record<string, JSX.Element> = {
  // Two balls, one behind the other — the same score, twice.
  double_trouble: (
    <>
      <ellipse cx="9" cy="14" rx="6" ry="4" transform="rotate(-20 9 14)" />
      <path d="M6.5 14.5h4.5" />
      <path d="M9.5 7.2A6.2 4 0 0 1 19.6 11" />
      <path d="M14.5 4.6A6.2 4 0 0 1 21.4 8.2" />
    </>
  ),
  // A cleat driving into the turf.
  ground_game: (
    <>
      <path d="M4 15h11a3 3 0 0 0 3-3V8" />
      <path d="M4 15v3h14" />
      <path d="M7 18v2M11 18v2M15 18v2" />
    </>
  ),
  // A ball arcing downfield.
  air_raid: (
    <>
      <path d="M3 20C6 9 12 4 21 3" />
      <ellipse cx="17" cy="8" rx="3.2" ry="2.1" transform="rotate(-42 17 8)" />
      <path d="M15.8 9.2l2.4-2.4" />
    </>
  ),
  // A ball slipping loose, with a downward tax arrow.
  turnover_tax: (
    <>
      <ellipse cx="10" cy="9" rx="5.5" ry="3.5" transform="rotate(-25 10 9)" />
      <path d="M8 8.5h4" />
      <path d="M18 13v7M15 17l3 3 3-3" />
    </>
  ),
  // A crown for the red zone.
  red_zone_royalty: (
    <>
      <path d="M3 8l3.5 4L12 5l5.5 7L21 8v9H3z" />
      <path d="M3 20h18" />
    </>
  ),
  // A shield — points held out.
  iron_wall: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  // Carrying the load: stacked weight over a runner's line.
  workhorse: (
    <>
      <rect x="5" y="4" width="14" height="4" rx="1" />
      <rect x="7" y="9" width="10" height="4" rx="1" />
      <path d="M6 17h12M9 17v3M15 17v3" />
    </>
  ),
  // Officer's chevrons — the field general.
  field_general: (
    <>
      <path d="M5 7l7 4 7-4" />
      <path d="M5 12l7 4 7-4" />
      <path d="M5 17l7 4 7-4" />
    </>
  ),
  // A sprout: first year in the league.
  rookie_rule: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5z" />
      <path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z" />
    </>
  ),
  // A heart on a pennant — loyalty to your team.
  loyalty_clause: (
    <>
      <path d="M5 3v18" />
      <path d="M5 4h14l-3 4 3 4H5" />
      <path d="M11.2 6.2a1.6 1.6 0 0 1 2.3 0 1.6 1.6 0 0 1 0 2.2l-2.3 2.3-2.3-2.3a1.6 1.6 0 0 1 2.3-2.2z" />
    </>
  ),
  // Service stripes — years of experience.
  veteran_movement: (
    <>
      <path d="M6 5v14M10 5v14M14 5v14" />
      <path d="M17 12h5M19.5 9.5L22 12l-2.5 2.5" />
    </>
  ),
  // A padlock over the bracket of a division.
  division_lockdown: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
      <path d="M12 15v2" />
    </>
  ),
  // Two conferences meeting head on.
  conference_clash: (
    <>
      <path d="M3 12h6M6 9l3 3-3 3" />
      <path d="M21 12h-6M18 9l-3 3 3 3" />
      <path d="M12 5v14" />
    </>
  ),
  // A wing, struck through: tight ends grounded.
  no_fly_zone: (
    <>
      <path d="M3 14c4-6 9-8 15-8-1 6-5 10-11 10H3z" />
      <path d="M4 20L20 4" />
    </>
  ),
  // A hammer: run it, don't throw it.
  ground_and_pound: (
    <>
      <path d="M4 20l8-8" />
      <path d="M11 5l8 8-2.5 2.5-8-8z" />
      <path d="M13.5 2.5L21.5 10.5" />
    </>
  ),
  // Two arrows swapping places — the flex slot flipping.
  flex_flip: (
    <>
      <path d="M4 9h13M14 6l3 3-3 3" />
      <path d="M20 15H7M10 12l-3 3 3 3" />
    </>
  ),
  // Small figure against a big one.
  underdog_week: (
    <>
      <circle cx="6.5" cy="9" r="2" />
      <path d="M6.5 11.5V17M4 20l2.5-3 2.5 3M4 13.5h5" />
      <circle cx="17" cy="6.5" r="2.5" />
      <path d="M17 9.5V16M13.5 20L17 15.5 20.5 20M13 12h8" />
    </>
  ),
  // Stadium lights on a standard.
  primetime_only: (
    <>
      <path d="M12 12v9" />
      <rect x="5" y="4" width="14" height="6" rx="1.5" />
      <path d="M8.5 4V2.5M15.5 4V2.5" />
      <path d="M8.5 7h.01M12 7h.01M15.5 7h.01" />
    </>
  ),
  // Crosshair — steal a pick.
  sniper: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  // A closed eye — you can't see their board.
  blind_draft: (
    <>
      <path d="M3 10c3.5 4 6.5 6 9 6s5.5-2 9-6" />
      <path d="M4.5 14.5L3 17M19.5 14.5L21 17M9 16.2L8.2 19M15 16.2l.8 2.8" />
    </>
  ),
};

/** Shown when a rule key has no glyph — a plain playbook card. */
const FALLBACK = (
  <>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </>
);

export function RuleEmblem({
  ruleKey,
  className,
  size = 24,
}: {
  ruleKey: string;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[ruleKey] ?? FALLBACK}
    </svg>
  );
}
