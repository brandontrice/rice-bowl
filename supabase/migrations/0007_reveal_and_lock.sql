-- ═════════════════════════════════════════════════════════════════════════
-- 0007 — The reveal, and the kickoff lock
--
-- A week of this league has a fixed shape:
--
--   Tuesday    Sleeper's state.week advances. Last week finalises, a Bowl
--              Point is awarded, and the next card is dealt face down.
--   Tue-Thu    Both managers reveal the card and draft under it.
--   Thursday   First kickoff. The draft should be done.
--   Thu-Mon    Games. Scores accumulate.
--   Tuesday    Round again.
--
-- Two things were missing from the schema for that: when kickoff actually
-- is, and whether a manager has seen this week's card yet.
-- ═════════════════════════════════════════════════════════════════════════

-- First kickoff of the week, from ESPN's scoreboard. The draft deadline.
alter table weeks add column if not exists locks_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────
-- Who has turned the card over
--
-- Per manager, not per week: the point of a reveal is the moment you
-- personally see it, and the two of you rarely open the app together.
-- Recorded server-side rather than in sessionStorage so it survives a new
-- tab, a new device, and a cleared browser — a card you can re-flip by
-- opening an incognito window is not really a reveal.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists week_reveals (
  week_id uuid not null references weeks (id) on delete cascade,
  manager_id uuid not null references managers (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (week_id, manager_id)
);

alter table week_reveals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'week_reveals' and policyname = 'managers can read week_reveals'
  ) then
    create policy "managers can read week_reveals" on week_reveals
      for select using (is_manager());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'week_reveals' and policyname = 'managers can reveal for themselves'
  ) then
    create policy "managers can reveal for themselves" on week_reveals
      for insert with check (manager_id = auth.uid());
  end if;
end
$$;

-- The waiting-room screen already listens on `weeks`; adding reveals lets
-- the matchup page react the instant the other manager turns their card.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'week_reveals'
  ) then
    alter publication supabase_realtime add table week_reveals;
  end if;
end
$$;
