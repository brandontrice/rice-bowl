"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Manager } from "@/types/database";

/**
 * The room before the draft.
 *
 * Two separate signals, and both matter. *Present* is live Realtime
 * presence — who has the draft room open right now. *Ready* is a
 * deliberate click, stored in `draft_ready`, and the draft only goes live
 * when every manager has one. Presence alone would start a draft because
 * someone left a tab open overnight; readiness alone would let you start
 * into an empty room.
 *
 * The status flip happens in `set_draft_ready()` under a row lock, so two
 * simultaneous clicks can't start the draft twice.
 */
export function DraftLobby({
  draftId,
  managers,
  currentManagerId,
  initialReady,
}: {
  draftId: string;
  managers: Manager[];
  currentManagerId: string;
  initialReady: string[];
}) {
  const router = useRouter();
  const [ready, setReady] = useState<string[]>(initialReady);
  const [present, setPresent] = useState<string[]>([currentManagerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iAmReady = ready.includes(currentManagerId);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`lobby-${draftId}`, {
      config: { presence: { key: currentManagerId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setPresent(Object.keys(channel.presenceState()));
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_ready", filter: `draft_id=eq.${draftId}` },
        async () => {
          const { data } = await supabase
            .from("draft_ready")
            .select("manager_id")
            .eq("draft_id", draftId);
          setReady((data ?? []).map((r) => r.manager_id as string));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drafts", filter: `id=eq.${draftId}` },
        (payload) => {
          // The other manager readied up and the draft went live.
          if ((payload.new as { status?: string }).status === "active") router.refresh();
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, currentManagerId]);

  async function toggle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("set_draft_ready", {
      p_draft_id: draftId,
      p_ready: !iAmReady,
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if ((data as { started?: boolean })?.started) router.refresh();
  }

  const waitingOn = managers.filter((m) => !ready.includes(m.id));

  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border border-seam bg-surface px-6 py-10 text-center">
      <span className="label">The draft room</span>
      <h2 className="font-display text-4xl uppercase text-ink sm:text-5xl">
        {waitingOn.length === 0 ? "Starting…" : "Both managers have to be ready"}
      </h2>

      <div className="flex w-full max-w-md flex-col gap-2">
        {managers.map((m) => {
          const isReady = ready.includes(m.id);
          const isHere = present.includes(m.id);
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border-l-2 bg-ground px-3.5 py-3"
              style={{ borderLeftColor: m.accent_color }}
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                {isHere ? (
                  <>
                    <span className="animate-waiting absolute inline-flex h-full w-full rounded-full bg-jade/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-jade" />
                  </>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full border border-ink-faint" />
                )}
              </span>

              <span className="truncate text-sm font-semibold text-ink">
                {m.display_name}
                {m.id === currentManagerId && <span className="label ml-2">You</span>}
              </span>

              <span className="ml-auto flex items-center gap-2 font-data text-[10px] uppercase tracking-[0.1em]">
                <span className={isHere ? "text-jade" : "text-ink-faint"}>
                  {isHere ? "In the room" : "Away"}
                </span>
                <span className={isReady ? "text-accent" : "text-ink-faint"}>
                  {isReady ? "Ready" : "Not ready"}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-crimson">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
          iAmReady
            ? "border border-seam text-ink-dim hover:text-ink"
            : "bg-accent text-ground hover:opacity-90"
        }`}
      >
        {busy ? "…" : iAmReady ? "Not ready after all" : "Start draft"}
      </button>

      <p className="max-w-sm text-xs text-ink-faint">
        {waitingOn.length === 0
          ? "Both ready — the board is opening."
          : iAmReady
            ? `Waiting on ${waitingOn.map((m) => m.display_name).join(" and ")}.`
            : "Nobody can pick until both of you have started. Nothing is on the clock yet."}
      </p>
    </section>
  );
}
