import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h1 className="font-display text-4xl uppercase text-ink">No such week</h1>
      <p className="text-sm text-ink-dim">
        That week isn&apos;t on the schedule. It may have been from another season.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ground transition hover:opacity-90"
      >
        Back to the matchup
      </Link>
    </div>
  );
}
