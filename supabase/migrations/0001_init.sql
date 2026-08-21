-- Rice Bowl schema — run this in the Supabase SQL Editor (or via `supabase db push`).
-- Two-manager league: weekly snake draft from the live NFL pool + House Rule modifiers.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- Managers
-- ─────────────────────────────────────────────────────────────────────────

-- Fill this in with the two real emails before anyone signs up (see
-- supabase/seed_allowlist.sql.example). The signup trigger below only
-- promotes an auth.users row to a `managers` row if its email is listed here.
create table if not exists manager_allowlist (
  email text primary key,
  display_name text not null,
  accent_color text not null,
  favorite_team text,
  created_at timestamptz not null default now()
);

create table if not exists managers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  accent_color text not null,
  favorite_team text,
  created_at timestamptz not null default now()
);

create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from managers where id = auth.uid());
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allow record;
begin
  select * into allow from manager_allowlist where email = new.email;
  if found then
    insert into managers (id, email, display_name, accent_color, favorite_team)
    values (new.id, new.email, allow.display_name, allow.accent_color, allow.favorite_team)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Seasons & weeks
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  week_number int not null,
  house_rule_key text not null,
  house_rule_seed bigint not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'drafting', 'scoring', 'complete')),
  sniper_manager_id uuid references managers (id),
  sniper_used boolean not null default false,
  locked_division text,
  locked_conference text,
  flex_position text,
  winner_manager_id uuid references managers (id),
  home_score numeric,
  away_score numeric,
  created_at timestamptz not null default now(),
  unique (season_id, week_number)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Players (cached from Sleeper's public player pool)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists players (
  id text primary key, -- Sleeper player_id
  full_name text not null,
  first_name text,
  last_name text,
  position text,
  team text,
  years_exp int,
  status text,
  fantasy_positions text[],
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Draft
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null unique references weeks (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'complete')),
  draft_order jsonb not null, -- ordered array of manager_id, one entry per pick
  current_pick int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  week_id uuid not null references weeks (id) on delete cascade,
  manager_id uuid not null references managers (id),
  player_id text not null references players (id),
  pick_number int not null,
  round int not null,
  roster_slot text not null,
  picked_at timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, player_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Scoring
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists weekly_scores (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  manager_id uuid not null references managers (id),
  player_id text not null references players (id),
  roster_slot text not null,
  raw_stats jsonb,
  points numeric not null default 0,
  computed_at timestamptz not null default now(),
  unique (week_id, manager_id, player_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Trash talk & wagers
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists trash_talk (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  manager_id uuid not null references managers (id),
  message text not null,
  updated_at timestamptz not null default now(),
  unique (week_id, manager_id)
);

create table if not exists wagers (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'settled')),
  loser_manager_id uuid references managers (id),
  payout_note text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — this is a trusted two-person league; any signed-in manager can
-- read/write league data. Only the allowlist->managers provisioning is
-- locked down (handled by the SECURITY DEFINER trigger above).
-- ─────────────────────────────────────────────────────────────────────────

alter table manager_allowlist enable row level security;
alter table managers enable row level security;
alter table seasons enable row level security;
alter table weeks enable row level security;
alter table players enable row level security;
alter table drafts enable row level security;
alter table draft_picks enable row level security;
alter table weekly_scores enable row level security;
alter table trash_talk enable row level security;
alter table wagers enable row level security;

create policy "managers can read managers" on managers for select using (is_manager());
create policy "managers can update own row" on managers for update using (id = auth.uid());

create policy "managers can read seasons" on seasons for select using (is_manager());
create policy "managers can write seasons" on seasons for all using (is_manager()) with check (is_manager());

create policy "managers can read weeks" on weeks for select using (is_manager());
create policy "managers can write weeks" on weeks for all using (is_manager()) with check (is_manager());

create policy "managers can read players" on players for select using (is_manager());
create policy "managers can write players" on players for all using (is_manager()) with check (is_manager());

create policy "managers can read drafts" on drafts for select using (is_manager());
create policy "managers can write drafts" on drafts for all using (is_manager()) with check (is_manager());

create policy "managers can read draft_picks" on draft_picks for select using (is_manager());
create policy "managers can insert own draft_picks" on draft_picks for insert with check (manager_id = auth.uid());

create policy "managers can read weekly_scores" on weekly_scores for select using (is_manager());
create policy "managers can write weekly_scores" on weekly_scores for all using (is_manager()) with check (is_manager());

create policy "managers can read trash_talk" on trash_talk for select using (is_manager());
create policy "managers can insert own trash_talk" on trash_talk for insert with check (manager_id = auth.uid());
create policy "managers can update own trash_talk" on trash_talk for update using (manager_id = auth.uid()) with check (manager_id = auth.uid());

create policy "managers can read wagers" on wagers for select using (is_manager());
create policy "managers can write wagers" on wagers for all using (is_manager()) with check (is_manager());

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table drafts;
alter publication supabase_realtime add table draft_picks;
alter publication supabase_realtime add table trash_talk;
alter publication supabase_realtime add table weeks;
