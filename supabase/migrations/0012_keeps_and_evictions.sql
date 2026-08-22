-- ═════════════════════════════════════════════════════════════════════════
-- 0012 — Keeps, Full House, and Evictions
--
-- The league stops being a pure weekly redraft and starts accumulating a
-- team.
--
--   After Week 1   keep one player. Week 2 drafts the other seven.
--   After Week 2   keep another. Week 3 drafts six.
--   ...
--   After Week 8   the eighth keep lands. Nothing left to draft.
--
-- That last state is Full House, and it is where the twist starts: from
-- then on you must evict one resident every week and draft their
-- replacement. The roster stops growing and starts turning over, one
-- player at a time, forever.
--
-- Keeps are materialised into the new week's draft_picks with kept = true,
-- so scoring, rosters and the matchup page keep working unchanged — a kept
-- player is just a pick that was already made.
-- ═════════════════════════════════════════════════════════════════════════

alter table draft_picks add column if not exists kept boolean not null default false;

create table if not exists roster_keeps (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  manager_id uuid not null references managers (id) on delete cascade,
  player_id text not null references players (id),
  -- The week after which this player was kept: active from the next one.
  kept_after_week int not null,
  -- The last week they were active for. Null while still a resident.
  released_after_week int,
  created_at timestamptz not null default now()
);

-- One live keep per player per manager per season. Partial, so a player
-- evicted and later re-drafted and re-kept is allowed.
create unique index if not exists roster_keeps_active_idx
  on roster_keeps (season_id, manager_id, player_id)
  where released_after_week is null;

create index if not exists roster_keeps_lookup_idx
  on roster_keeps (season_id, manager_id, kept_after_week);

alter table roster_keeps enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'roster_keeps' and policyname = 'managers can read roster_keeps'
  ) then
    create policy "managers can read roster_keeps" on roster_keeps
      for select using (is_manager());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'roster_keeps'
  ) then
    alter publication supabase_realtime add table roster_keeps;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- active_keeps() — who a manager is carrying into a given week
-- ─────────────────────────────────────────────────────────────────────────

create or replace function active_keeps(
  p_season_id uuid,
  p_manager_id uuid,
  p_for_week int
)
returns table (player_id text)
language sql
stable
security definer
set search_path = public
as $$
  select k.player_id
  from roster_keeps k
  where k.season_id = p_season_id
    and k.manager_id = p_manager_id
    and k.kept_after_week < p_for_week
    and (k.released_after_week is null or k.released_after_week >= p_for_week);
$$;

grant execute on function active_keeps(uuid, uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- keep_player() — claim one player off a finished week
-- ─────────────────────────────────────────────────────────────────────────

create or replace function keep_player(p_week_id uuid, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week      weeks%rowtype;
  v_existing  int;
  v_held      int;
  v_roster    int;
begin
  if not is_manager() then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found' using errcode = 'P0002';
  end if;

  -- Only off a week that has actually been played. Keeping before the
  -- games would be choosing on projection rather than on what happened.
  if v_week.status <> 'complete' then
    raise exception 'that week is not finished yet' using errcode = 'P0001';
  end if;

  select count(*) into v_roster
  from draft_picks
  where week_id = p_week_id and manager_id = auth.uid() and player_id = p_player_id;

  if v_roster = 0 then
    raise exception 'that player was not on your roster that week' using errcode = 'P0001';
  end if;

  -- One keep per week, and never more than a full roster.
  select count(*) into v_existing
  from roster_keeps
  where season_id = v_week.season_id
    and manager_id = auth.uid()
    and kept_after_week = v_week.week_number;

  if v_existing > 0 then
    raise exception 'you already kept someone from week %', v_week.week_number
      using errcode = 'P0001';
  end if;

  select count(*) into v_held from active_keeps(v_week.season_id, auth.uid(), v_week.week_number + 1);
  if v_held >= 8 then
    raise exception 'your house is full — evict someone first' using errcode = 'P0001';
  end if;

  insert into roster_keeps (season_id, manager_id, player_id, kept_after_week)
  values (v_week.season_id, auth.uid(), p_player_id, v_week.week_number);

  return jsonb_build_object('ok', true, 'keeps', v_held + 1, 'fullHouse', v_held + 1 >= 8);
end;
$$;

revoke all on function keep_player(uuid, text) from public;
grant execute on function keep_player(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- evict_player() — the twist, once the house is full
--
-- Only available at Full House, and only one per week. Evicting frees the
-- slot that next week's draft fills, so the roster turns over one player
-- at a time rather than sitting frozen for ten weeks.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function evict_player(
  p_season_id uuid,
  p_player_id text,
  p_for_week int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_held    int;
  v_already int;
  v_owned   int;
begin
  if not is_manager() then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select count(*) into v_held from active_keeps(p_season_id, auth.uid(), p_for_week);
  if v_held < 8 then
    raise exception 'evictions start once your house is full' using errcode = 'P0001';
  end if;

  select count(*) into v_already
  from roster_keeps
  where season_id = p_season_id
    and manager_id = auth.uid()
    and released_after_week = p_for_week - 1;

  if v_already > 0 then
    raise exception 'you already evicted someone this week' using errcode = 'P0001';
  end if;

  select count(*) into v_owned
  from roster_keeps
  where season_id = p_season_id
    and manager_id = auth.uid()
    and player_id = p_player_id
    and released_after_week is null;

  if v_owned = 0 then
    raise exception 'that player is not one of your residents' using errcode = 'P0001';
  end if;

  update roster_keeps
     set released_after_week = p_for_week - 1
   where season_id = p_season_id
     and manager_id = auth.uid()
     and player_id = p_player_id
     and released_after_week is null;

  return jsonb_build_object('ok', true, 'evicted', p_player_id, 'forWeek', p_for_week);
end;
$$;

revoke all on function evict_player(uuid, text, int) from public;
grant execute on function evict_player(uuid, text, int) to authenticated;
