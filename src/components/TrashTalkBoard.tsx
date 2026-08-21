"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
import type { Manager, TrashTalk } from "@/types/database";

export function TrashTalkBoard({
  weekId,
  managers,
  currentManagerId,
  initial,
}: {
  weekId: string;
  managers: Manager[];
  currentManagerId: string;
  initial: TrashTalk[];
}) {
  const [messages, setMessages] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of initial) map[t.manager_id] = t.message;
    return map;
  });
  const [draft, setDraft] = useState(messages[currentManagerId] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`trash-talk-${weekId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trash_talk", filter: `week_id=eq.${weekId}` },
        (payload) => {
          const row = payload.new as TrashTalk;
          if (!row?.manager_id) return;
          setMessages((prev) => ({ ...prev, [row.manager_id]: row.message }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekId]);

  const pinned = messages[currentManagerId] ?? "";
  const isDirty = draft.trim() !== pinned.trim();

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await supabase.from("trash_talk").upsert(
      {
        week_id: weekId,
        manager_id: currentManagerId,
        message: draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week_id,manager_id" },
    );
    if (saveError) {
      setError("That didn't pin. Check your connection and try again.");
      setSaving(false);
      return;
    }
    setMessages((prev) => ({ ...prev, [currentManagerId]: draft }));
    setSaving(false);
  }

  return (
    <Panel title="Trash Talk" bodyClassName="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        {managers.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border-l-2 bg-ground px-3.5 py-3"
            style={{ borderLeftColor: m.accent_color }}
          >
            <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {m.display_name}
            </span>
            <p className="mt-1 text-sm text-ink">
              {messages[m.id] || (
                <span className="italic text-ink-faint">No message pinned this week.</span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 280))}
          placeholder="Pin your one message for the week…"
          aria-label="Your message for the week"
          rows={2}
          className="resize-none rounded-lg border border-seam bg-ground px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        {error && <p className="text-xs text-crimson">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="font-data text-[10px] text-ink-faint">{draft.length}/280</span>
          <button
            type="button"
            onClick={save}
            disabled={saving || !isDirty}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ground transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Pinning…" : isDirty ? "Pin message" : "Pinned"}
          </button>
        </div>
      </div>
    </Panel>
  );
}
