import type { SleeperStatLine } from "@/lib/sleeper";

const n = (stats: SleeperStatLine, key: string) => stats[key] ?? 0;

export type ScoreBreakdown = {
  points: number;
  components: Record<string, number>;
};

/**
 * Full PPR base scoring — a point per reception — with the week's House
 * Rule layered on top of that base. Every rule is a modifier on these
 * numbers, so changing the base changes what the rules operate on: under
 * PPR, Workhorse and Double Trouble are both worth noticeably more than
 * they were at half.
 *
 * DEF uses Sleeper's precomputed pts_ppr as a base (points-allowed tiers
 * aren't worth reimplementing) with only iron_wall/red_zone_royalty on
 * top. PPR and half-PPR are identical for a defense, which catches no
 * passes; it is used for consistency rather than effect.
 *
 * Skill positions are computed from raw counting stats so the modifiers
 * can target individual categories.
 */
export function computeWeeklyPoints(
  position: string | null,
  stats: SleeperStatLine,
  houseRuleKey: string,
): ScoreBreakdown {
  if (position === "DEF") {
    let base = n(stats, "pts_ppr");
    const components: Record<string, number> = { base };
    if (houseRuleKey === "iron_wall") {
      components.iron_wall_bonus = base;
      base *= 2;
    }
    if (houseRuleKey === "red_zone_royalty") {
      const bonus = n(stats, "def_td") * 2;
      components.red_zone_bonus = bonus;
      base += bonus;
    }
    return { points: round(base), components };
  }

  let passYdPts = n(stats, "pass_yd") * 0.04;
  let passTdPts = n(stats, "pass_td") * 4;
  let rushYdPts = n(stats, "rush_yd") * 0.1;
  let rushTdPts = n(stats, "rush_td") * 6;
  const recYdPts = n(stats, "rec_yd") * 0.1;
  const recTdPts = n(stats, "rec_td") * 6;
  const recPts = n(stats, "rec") * 1;
  const twoPtPts =
    (n(stats, "pass_2pt") + n(stats, "rush_2pt") + n(stats, "rec_2pt")) * 2;

  let turnoverPts = (n(stats, "pass_int") + n(stats, "fum_lost")) * -2;

  const tdCount =
    n(stats, "pass_td") + n(stats, "rush_td") + n(stats, "rec_td");
  let redZoneBonus = 0;

  switch (houseRuleKey) {
    case "ground_game":
      rushYdPts *= 1.5;
      passTdPts *= 0.5;
      break;
    case "air_raid":
      passYdPts *= 1.5;
      rushTdPts *= 0.5;
      break;
    case "turnover_tax":
      turnoverPts *= 2;
      break;
    case "red_zone_royalty":
      redZoneBonus = tdCount * 2;
      break;
  }

  let total =
    passYdPts +
    passTdPts +
    rushYdPts +
    rushTdPts +
    recYdPts +
    recTdPts +
    recPts +
    twoPtPts +
    turnoverPts +
    redZoneBonus;

  switch (houseRuleKey) {
    case "double_trouble":
      if (position === "TE") total *= 2;
      break;
    case "workhorse":
      if (position === "RB") total *= 1.5;
      break;
    case "field_general":
      if (position === "QB") {
        const nonTurnover = total - turnoverPts;
        total = nonTurnover * 1.5 + turnoverPts * 2;
      }
      break;
  }

  return {
    points: round(total),
    components: {
      passYdPts,
      passTdPts,
      rushYdPts,
      rushTdPts,
      recYdPts,
      recTdPts,
      recPts,
      twoPtPts,
      turnoverPts,
      redZoneBonus,
    },
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
