"use client";

import { useState } from "react";
import { HOUSE_RULES } from "@/lib/house-rules";

const ENFORCEMENT_LABEL: Record<string, string> = {
  scoring: "Scoring modifier",
  "draft-pool": "Pool restriction",
  "roster-constraint": "Roster rule",
  "draft-order": "Draft order",
  visibility: "Draft visibility",
  honor: "Honor rule",
};

export function HouseRulesDeckBrowser() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-canvas-border bg-canvas-card p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-canvas-muted">
        The Deck
      </h3>
      <p className="mb-3 text-xs text-canvas-muted">
        {HOUSE_RULES.length} House Rules — one gets dealt every week.
      </p>
      <div className="flex flex-col divide-y divide-canvas-border/60">
        {HOUSE_RULES.map((rule) => {
          const isOpen = openKey === rule.key;
          return (
            <button
              key={rule.key}
              type="button"
              onClick={() => setOpenKey(isOpen ? null : rule.key)}
              className="flex flex-col gap-1 py-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-canvas-fg">{rule.name}</span>
                <span className="shrink-0 rounded-full border border-canvas-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-canvas-muted">
                  {ENFORCEMENT_LABEL[rule.enforcement]}
                </span>
              </div>
              <p className="text-xs text-accent">{rule.tagline}</p>
              {isOpen && <p className="mt-1 text-xs text-canvas-muted">{rule.description}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
