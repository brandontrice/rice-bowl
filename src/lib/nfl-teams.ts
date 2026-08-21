export type Division =
  | "AFC East"
  | "AFC North"
  | "AFC South"
  | "AFC West"
  | "NFC East"
  | "NFC North"
  | "NFC South"
  | "NFC West";

export const TEAM_DIVISION: Record<string, Division> = {
  BUF: "AFC East",
  MIA: "AFC East",
  NE: "AFC East",
  NYJ: "AFC East",
  BAL: "AFC North",
  CIN: "AFC North",
  CLE: "AFC North",
  PIT: "AFC North",
  HOU: "AFC South",
  IND: "AFC South",
  JAX: "AFC South",
  TEN: "AFC South",
  DEN: "AFC West",
  KC: "AFC West",
  LAC: "AFC West",
  LV: "AFC West",
  DAL: "NFC East",
  NYG: "NFC East",
  PHI: "NFC East",
  WAS: "NFC East",
  CHI: "NFC North",
  DET: "NFC North",
  GB: "NFC North",
  MIN: "NFC North",
  ATL: "NFC South",
  CAR: "NFC South",
  NO: "NFC South",
  TB: "NFC South",
  ARI: "NFC West",
  LAR: "NFC West",
  SF: "NFC West",
  SEA: "NFC West",
};

export const ALL_DIVISIONS = Array.from(
  new Set(Object.values(TEAM_DIVISION)),
) as Division[];

export function conferenceOf(division: Division): "AFC" | "NFC" {
  return division.startsWith("AFC") ? "AFC" : "NFC";
}

export function teamConference(team: string): "AFC" | "NFC" | null {
  const div = TEAM_DIVISION[team];
  return div ? conferenceOf(div) : null;
}
