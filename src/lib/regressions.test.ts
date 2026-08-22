import { describe, expect, it } from "vitest";
import { computeWeeklyPoints } from "@/lib/scoring";
import { assignSlot, buildSnakeOrder, poolRestriction, rosterSlotDefs } from "@/lib/draft";
import { adpOf, seasonGames } from "@/lib/projections";
import { easternDay } from "@/lib/nfl-date";
import { expectedKeeps } from "@/lib/keeps";
import type { Player, Week } from "@/types/database";

/**
 * Every case here is a bug that actually shipped, or a rule the game would
 * be broken without. The pure logic is the part worth pinning down: the
 * database work is verified against the live project, but arithmetic like
 * this is where the mistakes were, and none of them needed a database to
 * catch.
 */

const week = (over: Partial<Week> = {}) =>
  ({ house_rule_key: "__none__", flex_position: null, ...over }) as Week;

describe("scoring — full PPR base", () => {
  it("gives a point per reception", () => {
    const line = { rec: 8, rec_yd: 95, rec_td: 1 };
    // 8 receptions + 9.5 yards + 6 TD
    expect(computeWeeklyPoints("WR", line, "__none__").points).toBe(23.5);
  });

  it("does not change quarterback scoring", () => {
    // The PPR switch should move receivers and leave passers alone; Allen
    // staying at exactly his old total was the signal the change was clean.
    const line = { pass_yd: 300, pass_td: 3, rush_yd: 40, rush_td: 1 };
    expect(computeWeeklyPoints("QB", line, "__none__").points).toBe(34);
  });

  it("layers House Rules on top of the PPR base, not a half-PPR one", () => {
    const line = { rec: 10, rec_yd: 100 };
    const base = computeWeeklyPoints("TE", line, "__none__").points;
    expect(base).toBe(20);
    // Double Trouble doubles the whole PPR total, so receptions double too.
    expect(computeWeeklyPoints("TE", line, "double_trouble").points).toBe(40);
  });

  it("applies Workhorse to a running back's full line", () => {
    const line = { rush_yd: 100, rec: 4, rec_yd: 30 };
    expect(computeWeeklyPoints("RB", line, "__none__").points).toBe(17);
    expect(computeWeeklyPoints("RB", line, "workhorse").points).toBe(25.5);
  });

  it("taxes turnovers twice under Turnover Tax", () => {
    const line = { pass_yd: 250, pass_int: 2 };
    expect(computeWeeklyPoints("QB", line, "__none__").points).toBe(6);
    expect(computeWeeklyPoints("QB", line, "turnover_tax").points).toBe(2);
  });
});

describe("draft — slot assignment", () => {
  const defs = rosterSlotDefs(week());

  it("fills the exact slot before spending FLEX", () => {
    expect(assignSlot("RB", [], defs)).toBe("RB");
    expect(assignSlot("RB", [{ roster_slot: "RB" }], defs)).toBe("RB");
    // Both RB slots used, so a third goes to FLEX.
    expect(assignSlot("RB", [{ roster_slot: "RB" }, { roster_slot: "RB" }], defs)).toBe("FLEX");
  });

  it("refuses a player with nowhere left to go", () => {
    const full = [
      { roster_slot: "RB" },
      { roster_slot: "RB" },
      { roster_slot: "FLEX" },
    ];
    expect(assignSlot("RB", full, defs)).toBeNull();
  });

  it("honours Flex Flip by keeping non-receivers out of FLEX", () => {
    const flipped = rosterSlotDefs(week({ house_rule_key: "flex_flip" }));
    const rbsFull = [{ roster_slot: "RB" }, { roster_slot: "RB" }];
    expect(assignSlot("RB", rbsFull, flipped)).toBeNull();
    expect(assignSlot("WR", [{ roster_slot: "WR" }, { roster_slot: "WR" }], flipped)).toBe("FLEX");
  });
});

describe("draft — snake order shrinks with keeps", () => {
  const ids: [string, string] = ["a", "b"];

  it("alternates and reverses each round", () => {
    expect(buildSnakeOrder(ids, 2)).toEqual(["a", "b", "b", "a"]);
  });

  it("sizes itself to the rounds actually left", () => {
    expect(buildSnakeOrder(ids, 8)).toHaveLength(16);
    expect(buildSnakeOrder(ids, 1)).toEqual(["a", "b"]);
    // Full House: nothing to draft until somebody evicts.
    expect(buildSnakeOrder(ids, 0)).toEqual([]);
  });
});

describe("keeps — one per completed week, capped at a roster", () => {
  it("carries nothing into week 1 and one more each week after", () => {
    expect(expectedKeeps(1)).toBe(0);
    expect(expectedKeeps(2)).toBe(1);
    expect(expectedKeeps(8)).toBe(7);
  });

  it("stops at a full roster", () => {
    expect(expectedKeeps(9)).toBe(8);
    expect(expectedKeeps(18)).toBe(8);
  });
});

describe("pool restrictions", () => {
  const player = (over: Partial<Player>) => ({ position: "WR", team: "KC", ...over }) as Player;

  it("bans tight ends under No-Fly Zone", () => {
    const r = poolRestriction(week({ house_rule_key: "no_fly_zone" }));
    expect(r.isEligible(player({ position: "TE" }))).toBe(false);
    expect(r.isEligible(player({ position: "WR" }))).toBe(true);
  });

  it("requires three years under Veteran Movement", () => {
    const r = poolRestriction(week({ house_rule_key: "veteran_movement" }));
    expect(r.isEligible(player({ years_exp: 3 }))).toBe(true);
    expect(r.isEligible(player({ years_exp: 0 }))).toBe(false);
  });
});

describe("projections — the two values Sleeper lies about", () => {
  it("falls through 999, which is Sleeper's way of saying no ADP", () => {
    // The bug: `??` only skips null, so a 999 in the first field was
    // returned as-is and the player ended up with no ADP at all.
    expect(adpOf({ adp_ppr: 999, adp_half_ppr: 42.5 })).toBe(42.5);
    expect(adpOf({ adp_ppr: 12.3, adp_half_ppr: 42.5 })).toBe(12.3);
    expect(adpOf({ adp_ppr: 999, adp_half_ppr: 999, adp_std: 999 })).toBeNull();
    expect(adpOf({})).toBeNull();
  });

  it("ignores the gp=1 marker Sleeper uses for team defenses", () => {
    // Dividing a defense's season total by 1 put the Rams at 106 a game.
    expect(seasonGames({ gp: 1 })).toBe(18);
    expect(seasonGames({ gp: 18 })).toBe(18);
    expect(seasonGames({})).toBe(18);
    expect(seasonGames({ gp: 16 })).toBe(16);
  });
});

describe("schedule — a night game belongs to the day it kicked off", () => {
  it("keeps an 8:20pm Eastern kickoff on its own day", () => {
    // Stored UTC is already the next day; slicing the ISO string put this
    // and every other primetime game a day late.
    expect(easternDay("2026-09-10T00:20:00Z")).toBe("2026-09-09");
  });

  it("leaves an afternoon kickoff alone", () => {
    expect(easternDay("2026-09-13T17:00:00Z")).toBe("2026-09-13");
  });

  it("handles the winter offset too", () => {
    // January is EST, so 01:15Z is still the previous evening.
    expect(easternDay("2026-12-04T01:15:00Z")).toBe("2026-12-03");
  });
});
