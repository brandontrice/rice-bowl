"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

  async function save() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("trash_talk")
      .upsert(
        { week_id: weekId, manager_id: currentManagerId, message: draft, updated_at: new Date().toISOString() },
        { onConflict: "week_id,manager_id" },
      );
    setMessages((prev) => ({ ...prev, [currentManagerId]: draft }));
    setSaving(false);
  }

  return (
    <div className="rounded-2xl border border-seam bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-dim">
        Trash Talk
      </h3>
      <div className="flex flex-col gap-3">
        {managers.map((m) => (
          <div key={m.id} className="rounded-xl border border-seam/70 bg-ground p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.accent_color }} />
              <span className="text-xs font-semibold text-ink">{m.display_name}</span>
            </div>
            <p className="text-sm text-ink-dim">
              {messages[m.id] || <span className="italic">No message pinned this week.</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 280))}
          placeholder="Pin your one message for the week…"
          rows={2}
          className="resize-none rounded-lg border border-seam bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink-dim">{draft.length}/280</span>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Pinning…" : "Pin message"}
          </button>
        </div>
      </div>
    </div>
  );
}
