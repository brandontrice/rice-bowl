"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-full px-3 py-1.5 font-data text-[10px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:text-ink"
    >
      Sign out
    </button>
  );
}
