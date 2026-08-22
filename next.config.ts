import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Sleeper serves player headshots and team logos on a public CDN,
    // keyed by the same player_id we already store.
    remotePatterns: [
      new URL("https://sleepercdn.com/content/nfl/players/**"),
      new URL("https://sleepercdn.com/images/team_logos/nfl/**"),
      // ESPN team logos, used on the schedule.
      new URL("https://a.espncdn.com/i/teamlogos/nfl/**"),
    ],
  },
};

export default nextConfig;
