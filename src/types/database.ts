export type ManagerAllowlistEntry = {
  email: string;
  display_name: string;
  accent_color: string;
  favorite_team: string | null;
  created_at: string;
};

export type Manager = {
  id: string;
  email: string;
  display_name: string;
  accent_color: string;
  favorite_team: string | null;
  created_at: string;
};

export type Season = {
  id: string;
  year: number;
  name: string;
  created_at: string;
};

export type WeekStatus = "upcoming" | "drafting" | "scoring" | "complete";

export type Week = {
  id: string;
  season_id: string;
  week_number: number;
  house_rule_key: string;
  house_rule_seed: number;
  status: WeekStatus;
  sniper_manager_id: string | null;
  sniper_used: boolean;
  locked_division: string | null;
  locked_conference: string | null;
  flex_position: string | null;
  winner_manager_id: string | null;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
};

export type Player = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team: string | null;
  years_exp: number | null;
  status: string | null;
  fantasy_positions: string[] | null;
  updated_at: string;
  ppg: number | null;
  pos_rank: number | null;
  games_played: number | null;
};

export type DraftStatus = "pending" | "active" | "complete";

export type Draft = {
  id: string;
  week_id: string;
  status: DraftStatus;
  draft_order: string[];
  current_pick: number;
  created_at: string;
};

export type DraftPick = {
  id: string;
  draft_id: string;
  week_id: string;
  manager_id: string;
  player_id: string;
  pick_number: number;
  round: number;
  roster_slot: string;
  picked_at: string;
};

export type WeeklyScore = {
  id: string;
  week_id: string;
  manager_id: string;
  player_id: string;
  roster_slot: string;
  raw_stats: Record<string, number> | null;
  points: number;
  computed_at: string;
};

export type TrashTalk = {
  id: string;
  week_id: string;
  manager_id: string;
  message: string;
  updated_at: string;
};

export type WagerStatus = "pending" | "settled";

export type Wager = {
  id: string;
  week_id: string;
  description: string;
  status: WagerStatus;
  loser_manager_id: string | null;
  payout_note: string | null;
  created_at: string;
};
