-- ═════════════════════════════════════════════════════════════════════════
-- 0006 — Preseason projections and ADP
--
-- Sleeper publishes season and per-week projections on an undocumented but
-- stable endpoint, including average draft position. Both matter here:
-- projections are the only forward-looking number the app has, and ADP is
-- the closest thing to a consensus ranking for a draft board.
--
-- Week 0 means "the whole season" — the same shape holds weekly
-- projections later without a second table.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists player_projections (
  player_id text not null references players (id) on delete cascade,
  season int not null,
  week int not null default 0,
  points numeric,
  ppg numeric,
  adp numeric,
  stats jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, season, week)
);

create index if not exists player_projections_season_ppg_idx
  on player_projections (season, week, ppg desc nulls last);

-- Denormalised onto players so the rankings list and the draft board can
-- order by projection without a join on every render.
alter table players add column if not exists proj_ppg numeric;
alter table players add column if not exists proj_points numeric;
alter table players add column if not exists adp numeric;

create index if not exists players_proj_ppg_idx on players (proj_ppg desc nulls last);
create index if not exists players_adp_idx on players (adp asc nulls last);

alter table player_projections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'player_projections' and policyname = 'managers can read player_projections'
  ) then
    create policy "managers can read player_projections" on player_projections
      for select using (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'player_projections' and policyname = 'managers can write player_projections'
  ) then
    create policy "managers can write player_projections" on player_projections
      for all using (is_manager()) with check (is_manager());
  end if;
end
$$;
