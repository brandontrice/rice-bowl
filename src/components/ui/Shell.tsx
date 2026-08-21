import clsx from "clsx";

const WIDTHS = {
  reading: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

/** Page-level container. `wide` is for the draft board; `reading` for everything else. */
export function Shell({
  width = "reading",
  className,
  style,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx("mx-auto flex w-full flex-col gap-6", WIDTHS[width], className)}
      style={style}
    >
      {children}
    </div>
  );
}
