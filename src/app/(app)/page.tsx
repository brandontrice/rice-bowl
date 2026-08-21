import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentWeek } from "@/lib/ensure-week";
import { getCurrentManager } from "@/lib/data";

export default async function Home() {
  const manager = await getCurrentManager();
  if (!manager) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-4xl uppercase text-canvas-fg">Not on the roster</h1>
        <p className="max-w-sm text-sm text-canvas-muted">
          You&apos;re signed in, but this email isn&apos;t on the league&apos;s manager allowlist yet.
          Add it in Supabase (manager_allowlist) and sign in again.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const result = await ensureCurrentWeek(supabase);

  if (!result.week) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-4xl uppercase text-canvas-fg">Hang tight</h1>
        <p className="max-w-sm text-sm text-canvas-muted">{result.error}</p>
      </div>
    );
  }

  redirect(`/week/${result.week.id}`);
}
