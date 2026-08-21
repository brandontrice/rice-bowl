import clsx from "clsx";

/**
 * The quieter tier. The matchup page has exactly two loud surfaces — the
 * House Rule card and the head-to-head — and everything else is context,
 * so it all shares this one restrained shape.
 */
export function Panel({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx("overflow-hidden rounded-2xl border border-seam bg-surface", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-seam-soft px-4 py-3">
        <h2 className="label">{title}</h2>
        {action}
      </header>
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
