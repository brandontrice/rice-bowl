/**
 * The league's mark: a football inside a house.
 *
 * The name and the game already share the word — a House Rule is dealt
 * every week, and "house rules" is what you call the version of a game
 * played at somebody's kitchen table. The mark says the same thing:
 * football, played under this roof, by these rules.
 *
 * Stroke-based and `currentColor`, like the rule emblems, so the two sets
 * look related.
 */
export function HouseMark({
  size = 40,
  className,
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* the roof, carried past the walls like a porch */}
      <path d="M4 21L24 6l20 15" />
      {/* the house */}
      <path d="M9 19v22h30V19" />
      <path d="M6 41h36" />
      {/* the ball under the roof */}
      <g className={animated ? "animate-float" : undefined} style={{ transformOrigin: "24px 29px" }}>
        <ellipse cx="24" cy="29" rx="8" ry="5.5" transform="rotate(-14 24 29)" />
        <path d="M19.5 30h9" transform="rotate(-14 24 29)" />
        <path d="M22 27.4v3.6M26 26.6v3.6" transform="rotate(-14 24 29)" />
      </g>
    </svg>
  );
}
