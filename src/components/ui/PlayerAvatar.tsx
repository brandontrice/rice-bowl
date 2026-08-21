"use client";

import Image from "next/image";
import { useState } from "react";
import clsx from "clsx";
import { positionColor } from "@/lib/rule-style";

const SIZES = { sm: 24, md: 32, lg: 44 } as const;

/**
 * Sleeper's headshot CDN has gaps — practice-squad players and fresh
 * signings often 404 — so this always has an initials fallback rather
 * than a broken frame. Defenses use the team logo instead of a face.
 */
export function PlayerAvatar({
  playerId,
  name,
  position,
  team,
  size = "md",
  className,
}: {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZES[size];
  const isDefense = position === "DEF" || position === "DST";

  const src = isDefense
    ? team
      ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`
      : null
    : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <span
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-surface-raised",
        className,
      )}
      style={{ width: px, height: px, borderColor: `color-mix(in srgb, ${positionColor(position)} 35%, transparent)` }}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width={px}
          height={px}
          className={clsx("h-full w-full", isDefense ? "object-contain p-1" : "object-cover")}
          onError={() => setFailed(true)}
          unoptimized={isDefense}
        />
      ) : (
        <span
          className="font-data text-[9px] font-semibold"
          style={{ color: positionColor(position) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
