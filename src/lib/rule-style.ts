import type { HouseRuleEnforcement } from "@/lib/house-rules";

/**
 * One hue per enforcement category, used on the week card, the deck, and
 * the season ladder so the category is recognisable at a glance. Honor
 * rules are deliberately the quiet one — they're the rules you have to
 * police yourselves, not ones the app enforces.
 */
export const RULE_STYLE: Record<
  HouseRuleEnforcement,
  { label: string; color: string }
> = {
  scoring: { label: "Scoring", color: "var(--goalpost)" },
  "draft-pool": { label: "Pool", color: "var(--pos-wr)" },
  "roster-constraint": { label: "Roster", color: "var(--jade)" },
  "draft-order": { label: "Draft order", color: "var(--mgr-a)" },
  visibility: { label: "Visibility", color: "var(--orchid)" },
  honor: { label: "Honor rule", color: "var(--ink-dim)" },
};

const POSITION_COLORS: Record<string, string> = {
  QB: "var(--pos-qb)",
  RB: "var(--pos-rb)",
  WR: "var(--pos-wr)",
  TE: "var(--pos-te)",
  DEF: "var(--pos-dst)",
  DST: "var(--pos-dst)",
};

export function positionColor(position: string | null | undefined): string {
  return POSITION_COLORS[position ?? ""] ?? "var(--ink-dim)";
}
