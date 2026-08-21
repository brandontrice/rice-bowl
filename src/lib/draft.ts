import type { Player, Week, DraftPick } from "@/types/database";
import { TEAM_DIVISION, teamConference, type Division } from "@/lib/nfl-teams";
import { mulberry32, pick as rngPick } from "@/lib/prng";

export type SlotKey = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST";

export type SlotDef = {
  slot: SlotKey;
  eligible: string[]; // Player.position values
  count: number;
};

const BASE_FLEX_ELIGIBLE = ["RB", "WR", "TE"];

/** The week's 8 roster slots, adjusted for flex_flip / pool-ban rules. */
export function rosterSlotDefs(week: Pick<Week, "house_rule_key" | "flex_position">): SlotDef[] {
  let flexEligible = BASE_FLEX_ELIGIBLE;
  if (week.house_rule_key === "flex_flip" || week.flex_position === "WR") {
    flexEligible = ["WR"];
  } else if (week.house_rule_key === "no_fly_zone") {
    flexEligible = flexEligible.filter((p) => p !== "TE");
  } else if (week.house_rule_key === "ground_and_pound") {
    flexEligible = flexEligible.filter((p) => p !== "WR");
  }

  return [
    { slot: "QB", eligible: ["QB"], count: 1 },
    { slot: "RB", eligible: ["RB"], count: 2 },
    { slot: "WR", eligible: ["WR"], count: 2 },
    { slot: "TE", eligible: ["TE"], count: 1 },
    { slot: "FLEX", eligible: flexEligible, count: 1 },
    { slot: "DST", eligible: ["DEF"], count: 1 },
  ];
}

export const TOTAL_ROSTER_SIZE = 8;

/**
 * Greedily assigns a newly picked player's position to the most specific
 * open slot (exact position before FLEX). Returns null if no open slot can
 * hold this position — the pick should be rejected.
 */
export function assignSlot(
  position: string | null,
  existingPicks: Pick<DraftPick, "roster_slot">[],
  slotDefs: SlotDef[],
): SlotKey | null {
  const used: Record<string, number> = {};
  for (const p of existingPicks) {
    used[p.roster_slot] = (used[p.roster_slot] ?? 0) + 1;
  }

  const exact = slotDefs.find(
    (d) => d.eligible.length === 1 && d.eligible[0] === position && d.slot !== "FLEX",
  );
  if (exact && (used[exact.slot] ?? 0) < exact.count) {
    return exact.slot;
  }

  const flex = slotDefs.find((d) => d.slot === "FLEX");
  if (flex && position && flex.eligible.includes(position) && (used["FLEX"] ?? 0) < flex.count) {
    return "FLEX";
  }

  return null;
}

/** Whether any open slot could still accept this position, for pool display. */
export function hasOpenSlotFor(
  position: string | null,
  existingPicks: Pick<DraftPick, "roster_slot">[],
  slotDefs: SlotDef[],
): boolean {
  return assignSlot(position, existingPicks, slotDefs) !== null;
}

export type PoolRestriction = {
  reason: string | null;
  isEligible: (player: Player) => boolean;
};

/** Draft-pool-level House Rule restrictions (independent of roster slots). */
export function poolRestriction(
  week: Pick<Week, "house_rule_key" | "locked_division" | "locked_conference">,
): PoolRestriction {
  switch (week.house_rule_key) {
    case "veteran_movement":
      return {
        reason: "Only players with 3+ years of experience are draftable this week.",
        isEligible: (p) => (p.years_exp ?? 0) >= 3,
      };
    case "division_lockdown":
      return {
        reason: week.locked_division
          ? `Only ${week.locked_division} players are draftable this week.`
          : null,
        isEligible: (p) =>
          !!p.team && TEAM_DIVISION[p.team] === week.locked_division,
      };
    case "conference_clash":
      return {
        reason: week.locked_conference
          ? `Only the ${week.locked_conference} is draftable this week.`
          : null,
        isEligible: (p) => !!p.team && teamConference(p.team) === week.locked_conference,
      };
    case "no_fly_zone":
      return {
        reason: "Tight ends are banned from the pool this week.",
        isEligible: (p) => p.position !== "TE",
      };
    case "ground_and_pound":
      return {
        reason: "Wide receivers are banned from the pool this week.",
        isEligible: (p) => p.position !== "WR",
      };
    default:
      return { reason: null, isEligible: () => true };
  }
}

/** Derives the locked division/conference for the week from its seed, if applicable. */
export function derivePoolLock(
  houseRuleKey: string,
  seed: number,
): { locked_division: Division | null; locked_conference: "AFC" | "NFC" | null } {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  if (houseRuleKey === "division_lockdown") {
    const divisions = Array.from(new Set(Object.values(TEAM_DIVISION))) as Division[];
    return { locked_division: rngPick(rng, divisions), locked_conference: null };
  }
  if (houseRuleKey === "conference_clash") {
    return {
      locked_division: null,
      locked_conference: rngPick(rng, ["AFC", "NFC"] as const),
    };
  }
  return { locked_division: null, locked_conference: null };
}

/** Standard snake order for a 2-manager, 8-round draft (equivalent to strict alternation). */
export function buildSnakeOrder(managerIds: [string, string]): string[] {
  const order: string[] = [];
  for (let round = 0; round < TOTAL_ROSTER_SIZE; round++) {
    const reversed = round % 2 === 1;
    const roundOrder = reversed ? [managerIds[1], managerIds[0]] : managerIds;
    order.push(...roundOrder);
  }
  return order;
}
