/**
 * The league's mark: a ball arcing into a bowl.
 *
 * "Rice Bowl" is a joke with two halves — a bowl game and a bowl of rice —
 * and the mark keeps both: a wide vessel with an arc dropping into it and
 * a football at the top of the flight. Stroke-based and `currentColor`,
 * like the rule emblems, so the two sets look related.
 */
export function BowlMark({
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
      {/* the bowl */}
      <path d="M7 27h34c0 8.5-7.6 14-17 14S7 35.5 7 27z" />
      <path d="M4.5 27h39" />

      {/* the flight in */}
      <path
        d="M40 21c-2.5-8-9-13-17-13"
        strokeDasharray="2.5 3.5"
        opacity="0.55"
      />

      {/* the ball, at the top of its arc */}
      <g className={animated ? "animate-float" : undefined} style={{ transformOrigin: "23px 8px" }}>
        <ellipse cx="23" cy="8" rx="6.5" ry="4.5" transform="rotate(-14 23 8)" />
        <path d="M19.5 8.8h7" transform="rotate(-14 23 8)" />
      </g>
    </svg>
  );
}
