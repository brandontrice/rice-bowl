/**
 * Kept apart from player-browser.ts on purpose: that module reaches for
 * `next/headers` through the Supabase server client, so importing a
 * constant from it drags server-only code into any client bundle.
 */
export const BROWSABLE_POSITIONS = ["QB", "RB", "WR", "TE", "DEF"] as const;

export type BrowsablePosition = (typeof BROWSABLE_POSITIONS)[number];
