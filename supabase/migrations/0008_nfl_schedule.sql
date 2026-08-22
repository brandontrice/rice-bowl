-- ═════════════════════════════════════════════════════════════════════════
-- 0008 — The NFL schedule
--
-- Cached rather than fetched per page view, for two reasons: a team's
-- season view would otherwise be eighteen upstream requests, and holding
-- the rows locally means kickoff times, networks and live scores are all
-- filterable in one query.
--
-- Team codes are stored in Sleeper's convention (WAS, not ESPN's WSH) so
-- they join straight against players.team.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists nfl_games (
  id text primary key,                  -- ESPN event id
  season int not null,
  week int not null,
  season_type text not null default 'regular',
  kickoff_at timestamptz,
  home_team text,
  away_team text,
  home_name text,
  away_name text,
  home_score int,
  away_score int,
  status text,                          -- pre | in | post
  status_detail text,
  network text,
  venue text,
  neutral_site boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists nfl_games_week_idx on nfl_games (season, week, kickoff_at);
create index if not exists nfl_games_home_idx on nfl_games (season, home_team);
create index if not exists nfl_games_away_idx on nfl_games (season, away_team);

alter table nfl_games enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'nfl_games' and policyname = 'managers can read nfl_games'
  ) then
    create policy "managers can read nfl_games" on nfl_games
      for select using (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'nfl_games' and policyname = 'managers can write nfl_games'
  ) then
    create policy "managers can write nfl_games" on nfl_games
      for all using (is_manager()) with check (is_manager());
  end if;
end
$$;
