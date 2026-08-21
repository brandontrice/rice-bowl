-- ═════════════════════════════════════════════════════════════════════════
-- 0003 — Atomic drafting, week-scoped indexes, live scores, player ranking
--
-- Run this in the Supabase SQL Editor (or via `supabase db push`) after
-- 0001_init.sql and 0002_allowlist_read.sql.
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. make_pick() — one atomic transition instead of seven round-trips
--
-- The API route previously read the draft, validated, inserted the pick,
-- then wrote back `current_pick`. Between the read and the write nothing
-- held a lock, so a retried or double-submitted request could advance the
-- counter twice and skip a pick. This locks the draft row for the duration.
--
-- Rule logic (pool eligibility, which slot a position may fill) stays in
-- TypeScript, where the House Rules already live — duplicating it here
-- would mean two sources of truth. What this function owns is the state
-- transition and the capacity guard, which are the parts that must be
-- atomic. Slot *counts* are fixed regardless of House Rule; only slot
-- *eligibility* varies, so enforcing counts here is safe.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function make_pick(
  p_draft_id uuid,
  p_player_id text,
  p_roster_slot text,
  p_expected_pick int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft        drafts%rowtype;
  v_on_the_clock uuid;
  v_order_len    int;
  v_pick_number  int;
  v_round        int;
  v_next_pick    int;
  v_is_complete  boolean;
  v_slot_cap     int;
  v_slot_used    int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Serialise every concurrent pick attempt on this draft.
  select * into v_draft from drafts where id = p_draft_id for update;

  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status = 'complete' then
    raise exception 'draft is already complete' using errcode = 'P0001';
  end if;

  -- Optimistic concurrency: the client tells us which pick it believed it
  -- was making. A stale or replayed request fails here rather than
  -- silently consuming someone else's turn.
  if p_expected_pick is not null and p_expected_pick <> v_draft.current_pick then
    raise exception 'the board moved — that pick was already made'
      using errcode = 'P0001';
  end if;

  v_order_len := jsonb_array_length(v_draft.draft_order);
  v_on_the_clock := (v_draft.draft_order ->> v_draft.current_pick)::uuid;

  if v_on_the_clock is distinct from auth.uid() then
    raise exception 'not your pick' using errcode = '42501';
  end if;

  v_slot_cap := case upper(p_roster_slot)
                  when 'QB' then 1
                  when 'RB' then 2
                  when 'WR' then 2
                  when 'TE' then 1
                  when 'FLEX' then 1
                  when 'DST' then 1
                  else 0
                end;

  if v_slot_cap = 0 then
    raise exception 'unknown roster slot: %', p_roster_slot using errcode = 'P0001';
  end if;

  select count(*) into v_slot_used
  from draft_picks
  where draft_id = p_draft_id
    and manager_id = auth.uid()
    and roster_slot = p_roster_slot;

  if v_slot_used >= v_slot_cap then
    raise exception 'no open % slot', p_roster_slot using errcode = 'P0001';
  end if;

  v_pick_number := v_draft.current_pick + 1;
  v_round := floor(v_draft.current_pick / 2) + 1;

  -- The unique (draft_id, player_id) constraint is the real guard against
  -- drafting a taken player; surface it as a clean error.
  begin
    insert into draft_picks (
      draft_id, week_id, manager_id, player_id, pick_number, round, roster_slot
    ) values (
      p_draft_id, v_draft.week_id, auth.uid(), p_player_id,
      v_pick_number, v_round, p_roster_slot
    );
  exception when unique_violation then
    raise exception 'that player is already drafted' using errcode = 'P0001';
  end;

  v_next_pick := v_draft.current_pick + 1;
  v_is_complete := v_next_pick >= v_order_len;

  update drafts
     set current_pick = v_next_pick,
         status = case when v_is_complete then 'complete' else 'active' end
   where id = p_draft_id;

  if v_is_complete then
    update weeks set status = 'scoring' where id = v_draft.week_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'slot', p_roster_slot,
    'pickNumber', v_pick_number,
    'round', v_round,
    'currentPick', v_next_pick,
    'isComplete', v_is_complete
  );
end;
$$;

revoke all on function make_pick(uuid, text, text, int) from public;
grant execute on function make_pick(uuid, text, text, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Week-scoped indexes
--
-- draft_picks' only indexes lead with draft_id, but the matchup page and
-- the scoring route both query by week_id. Same story for wagers.
-- Negligible at two managers; free to fix, and it keeps the V2 migration
-- from inheriting a bad schema.
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists draft_picks_week_id_idx on draft_picks (week_id);
create index if not exists wagers_week_id_idx on wagers (week_id);
create index if not exists weeks_season_status_idx on weeks (season_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Live scores
--
-- weekly_scores was never in the Realtime publication, so the matchup
-- page could not react to a score refresh. Both managers should watch the
-- same number move at the same time.
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'weekly_scores'
  ) then
    alter publication supabase_realtime add table weekly_scores;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Player ranking
--
-- Populated from Sleeper's season stats during the existing player sync.
-- This is what lets the draft board sort by "best available" instead of
-- alphabetically — the single biggest usability defect in V1.
-- ─────────────────────────────────────────────────────────────────────────

alter table players add column if not exists ppg numeric;
alter table players add column if not exists pos_rank int;
alter table players add column if not exists games_played int;

create index if not exists players_pos_rank_idx on players (position, pos_rank);
