-- ═════════════════════════════════════════════════════════════════════════
-- 0005 — Player stat history
--
-- Backs the player rankings browser: last season's production, this
-- season's as it accumulates, and a week-by-week game log.
--
-- Two tables rather than one because they are filled from different
-- places. Completed seasons come from Sleeper's season endpoint in a
-- single request and never change again. The current season is assembled
-- week by week from the same weekly stat pull the matchup scoring already
-- makes, so it updates while games are being played — and its totals are
-- derived from those weeks by a view rather than stored, so there is no
-- second copy to drift.
-- ═════════════════════════════════════════════════════════════════════════

alter table players add column if not exists espn_id text;

create index if not exists players_espn_id_idx on players (espn_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Completed seasons, pulled wholesale
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists player_season_stats (
  player_id text not null references players (id) on delete cascade,
  season int not null,
  games_played int,
  points numeric,
  ppg numeric,
  stats jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, season)
);

create index if not exists player_season_stats_rank_idx
  on player_season_stats (season, ppg desc nulls last);

-- ─────────────────────────────────────────────────────────────────────────
-- The current season, a week at a time
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists player_week_stats (
  player_id text not null references players (id) on delete cascade,
  season int not null,
  week int not null,
  points numeric,
  stats jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, season, week)
);

create index if not exists player_week_stats_season_week_idx
  on player_week_stats (season, week);

-- ─────────────────────────────────────────────────────────────────────────
-- Season-to-date totals, derived
--
-- security_invoker so the view respects the caller's RLS rather than
-- running as its owner, which would quietly hand every row to anyone.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view player_season_to_date
  with (security_invoker = on) as
select
  player_id,
  season,
  count(*) filter (where coalesce((stats ->> 'gp')::numeric, 0) > 0)::int as games_played,
  round(sum(coalesce(points, 0))::numeric, 2) as points,
  case
    when count(*) filter (where coalesce((stats ->> 'gp')::numeric, 0) > 0) = 0 then null
    else round(
      (sum(coalesce(points, 0))
        / count(*) filter (where coalesce((stats ->> 'gp')::numeric, 0) > 0))::numeric,
      1)
  end as ppg,
  max(week) as last_week
from player_week_stats
group by player_id, season;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — same posture as the rest of the schema: managers read, managers
-- write. Background jobs use the service role, which bypasses this.
-- ─────────────────────────────────────────────────────────────────────────

alter table player_season_stats enable row level security;
alter table player_week_stats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'player_season_stats' and policyname = 'managers can read player_season_stats'
  ) then
    create policy "managers can read player_season_stats" on player_season_stats
      for select using (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'player_season_stats' and policyname = 'managers can write player_season_stats'
  ) then
    create policy "managers can write player_season_stats" on player_season_stats
      for all using (is_manager()) with check (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'player_week_stats' and policyname = 'managers can read player_week_stats'
  ) then
    create policy "managers can read player_week_stats" on player_week_stats
      for select using (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'player_week_stats' and policyname = 'managers can write player_week_stats'
  ) then
    create policy "managers can write player_week_stats" on player_week_stats
      for all using (is_manager()) with check (is_manager());
  end if;
end
$$;
