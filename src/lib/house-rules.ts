export type HouseRuleEnforcement =
  | "scoring" // affects the scoring formula only
  | "draft-pool" // restricts which players are draftable this week
  | "roster-constraint" // a start/roster requirement, checked but not blocked
  | "draft-order" // affects who picks when
  | "visibility" // affects what managers can see during the draft
  | "honor"; // no data available to auto-enforce — trusted to self-enforce

export type HouseRule = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  enforcement: HouseRuleEnforcement;
};

export const HOUSE_RULES: HouseRule[] = [
  {
    key: "double_trouble",
    name: "Double Trouble",
    tagline: "Your TE scores double.",
    description: "Every point your tight end scores this week counts twice.",
    enforcement: "scoring",
  },
  {
    key: "ground_game",
    name: "Ground Game",
    tagline: "Rushing yards x1.5. Passing TDs worth half.",
    description:
      "Rushing yardage is worth 1.5x its normal rate. Passing touchdowns are worth half their normal points.",
    enforcement: "scoring",
  },
  {
    key: "air_raid",
    name: "Air Raid",
    tagline: "Passing yards x1.5. Rushing TDs worth half.",
    description:
      "Passing yardage is worth 1.5x its normal rate. Rushing touchdowns are worth half their normal points.",
    enforcement: "scoring",
  },
  {
    key: "turnover_tax",
    name: "Turnover Tax",
    tagline: "Interceptions and lost fumbles cost double.",
    description: "Every interception thrown or fumble lost is a double penalty this week.",
    enforcement: "scoring",
  },
  {
    key: "red_zone_royalty",
    name: "Red Zone Royalty",
    tagline: "Every touchdown is worth +2 bonus points.",
    description: "Any touchdown — passing, rushing, or receiving — earns a flat +2 point bonus.",
    enforcement: "scoring",
  },
  {
    key: "iron_wall",
    name: "Iron Wall",
    tagline: "Your DST scores double.",
    description: "Your defense/special teams points count twice this week.",
    enforcement: "scoring",
  },
  {
    key: "workhorse",
    name: "Workhorse",
    tagline: "RB points x1.5.",
    description: "All running back scoring — yardage, TDs, receptions — is multiplied by 1.5.",
    enforcement: "scoring",
  },
  {
    key: "field_general",
    name: "Field General",
    tagline: "QB points x1.5, but INTs cost double.",
    description: "Quarterback scoring is multiplied by 1.5, but interceptions are penalized double.",
    enforcement: "scoring",
  },
  {
    key: "rookie_rule",
    name: "Rookie Rule",
    tagline: "You must start at least 1 rookie.",
    description:
      "At least one player in your starting lineup must be a rookie (0 years of NFL experience). Checked, not blocked — the matchup screen will flag it if you don't.",
    enforcement: "roster-constraint",
  },
  {
    key: "loyalty_clause",
    name: "Loyalty Clause",
    tagline: "Roster at least 2 players from your favorite team.",
    description:
      "You must roster at least two players from the favorite team on your profile. Checked, not blocked.",
    enforcement: "roster-constraint",
  },
  {
    key: "veteran_movement",
    name: "Veteran Movement",
    tagline: "Only players with 3+ years of experience are draftable.",
    description: "This week's pool is restricted to players with at least 3 years of NFL experience.",
    enforcement: "draft-pool",
  },
  {
    key: "division_lockdown",
    name: "Division Lockdown",
    tagline: "Only one randomly chosen division is in play.",
    description:
      "The dealer locks one of the eight NFL divisions for the week — only players from those four teams are draftable.",
    enforcement: "draft-pool",
  },
  {
    key: "conference_clash",
    name: "Conference Clash",
    tagline: "Only one randomly chosen conference is in play.",
    description: "The dealer locks either the AFC or the NFC for the week — only players from that conference are draftable.",
    enforcement: "draft-pool",
  },
  {
    key: "no_fly_zone",
    name: "No-Fly Zone",
    tagline: "Tight ends are banned from the pool.",
    description: "No tight ends can be drafted this week — plan your FLEX accordingly.",
    enforcement: "draft-pool",
  },
  {
    key: "ground_and_pound",
    name: "Ground and Pound",
    tagline: "Wide receivers are banned from the pool.",
    description: "No wide receivers can be drafted this week — the FLEX slot must be filled by RB or TE.",
    enforcement: "draft-pool",
  },
  {
    key: "flex_flip",
    name: "Flex Flip",
    tagline: "Your FLEX slot must be a WR this week.",
    description: "The FLEX roster slot is restricted to wide receivers only this week.",
    enforcement: "roster-constraint",
  },
  {
    key: "underdog_week",
    name: "Underdog Week",
    tagline: "Only players from teams with a losing record.",
    description:
      "Only players on teams currently under .500 are eligible. Not auto-enforced (no live standings feed) — self-enforced on the honor system.",
    enforcement: "honor",
  },
  {
    key: "primetime_only",
    name: "Primetime Only",
    tagline: "Only players in a nationally televised game.",
    description:
      "Only players whose team plays Thursday, Sunday, or Monday night are eligible. Not auto-enforced — self-enforced on the honor system.",
    enforcement: "honor",
  },
  {
    key: "sniper",
    name: "Sniper",
    tagline: "Steal one pick from your opponent's draft order.",
    description:
      "The dealer names one manager the Sniper for the week. Before the draft starts, the Sniper may swap the position of one of their picks with the matching-round pick of their opponent.",
    enforcement: "draft-order",
  },
  {
    key: "blind_draft",
    name: "Blind Draft",
    tagline: "You can't see your opponent's picks until the draft ends.",
    description:
      "Both managers draft without seeing what the other has picked. The board reveals in full once the draft is complete.",
    enforcement: "visibility",
  },
];

export const HOUSE_RULE_BY_KEY: Record<string, HouseRule> = Object.fromEntries(
  HOUSE_RULES.map((rule) => [rule.key, rule]),
);

export function dealHouseRule(rng: () => number): HouseRule {
  const idx = Math.floor(rng() * HOUSE_RULES.length);
  return HOUSE_RULES[idx];
}
