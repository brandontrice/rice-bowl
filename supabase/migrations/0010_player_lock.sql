-- ═════════════════════════════════════════════════════════════════════════
-- 0010 — Players lock at their own kickoff
--
-- weeks.locks_at was only ever a countdown. Nothing consulted it when a
-- pick was made, so a draft that ran into Sunday let a manager take a
-- player whose Thursday game had already finished — with the box score in
-- front of them. In a league that redrafts every week that is the whole
-- ballgame.
--
-- A player locks when *their own* game kicks off, not when the week's
-- first game does. Taking a Sunday afternoon receiver at 9pm Thursday is
-- fine; taking the Thursday tight end who just posted 24 is not.
--
-- Enforced here rather than in the UI because the UI is a suggestion.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function player_is_locked(
  p_player_id text,
  p_season int,
  p_week int
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- No row means no game this week — a bye, or a team we can't resolve.
  -- Those stay draftable; they simply score nothing.
  select coalesce(bool_or(g.kickoff_at <= now()), false)
  from players p
  join nfl_games g
    on g.season = p_season
   and g.week = p_week
   and (g.home_team = p.team or g.away_team = p.team)
  where p.id = p_player_id;
$$;

revoke all on function player_is_locked(text, int, int) from public;
grant execute on function player_is_locked(text, int, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- make_pick() — as in 0004, plus the lock check
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
  v_deadline     timestamptz;
  v_week_number  int;
  v_season       int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_draft from drafts where id = p_draft_id for update;

  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status = 'complete' then
    raise exception 'draft is already complete' using errcode = 'P0001';
  end if;

  if p_expected_pick is not null and p_expected_pick <> v_draft.current_pick then
    raise exception 'the board moved — that pick was already made'
      using errcode = 'P0001';
  end if;

  v_order_len := jsonb_array_length(v_draft.draft_order);
  v_on_the_clock := (v_draft.draft_order ->> v_draft.current_pick)::uuid;

  if v_on_the_clock is distinct from auth.uid() then
    raise exception 'not your pick' using errcode = '42501';
  end if;

  select w.week_number, s.year into v_week_number, v_season
  from weeks w
  join seasons s on s.id = w.season_id
  where w.id = v_draft.week_id;

  if player_is_locked(p_player_id, v_season, v_week_number) then
    raise exception 'that player''s game has already kicked off'
      using errcode = 'P0001';
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

  v_deadline := case
                  when v_is_complete or v_draft.deadline_at is null then null
                  else now() + make_interval(secs => v_draft.pick_seconds)
                end;

  update drafts
     set current_pick = v_next_pick,
         status = case when v_is_complete then 'complete' else 'active' end,
         deadline_at = v_deadline
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
    'isComplete', v_is_complete,
    'deadlineAt', v_deadline
  );
end;
$$;

revoke all on function make_pick(uuid, text, text, int) from public;
grant execute on function make_pick(uuid, text, text, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- auto_pick() — as in 0004, plus the same check
--
-- The clock must never hand someone a locked player either. pickBestAvailable
-- filters them out before calling, but this is the guard that actually holds.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function auto_pick(
  p_draft_id uuid,
  p_player_id text,
  p_roster_slot text
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
  v_deadline     timestamptz;
  v_week_number  int;
  v_season       int;
begin
  if not is_manager() then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_draft from drafts where id = p_draft_id for update;

  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status = 'complete' then
    raise exception 'draft is already complete' using errcode = 'P0001';
  end if;

  if v_draft.deadline_at is null then
    raise exception 'the clock is not running' using errcode = 'P0001';
  end if;

  if now() < v_draft.deadline_at - interval '1 second' then
    raise exception 'there is still time on the clock' using errcode = 'P0001';
  end if;

  select w.week_number, s.year into v_week_number, v_season
  from weeks w
  join seasons s on s.id = w.season_id
  where w.id = v_draft.week_id;

  if player_is_locked(p_player_id, v_season, v_week_number) then
    raise exception 'that player''s game has already kicked off'
      using errcode = 'P0001';
  end if;

  v_order_len := jsonb_array_length(v_draft.draft_order);
  v_on_the_clock := (v_draft.draft_order ->> v_draft.current_pick)::uuid;
  v_pick_number := v_draft.current_pick + 1;
  v_round := floor(v_draft.current_pick / 2) + 1;

  begin
    insert into draft_picks (
      draft_id, week_id, manager_id, player_id, pick_number, round, roster_slot
    ) values (
      p_draft_id, v_draft.week_id, v_on_the_clock, p_player_id,
      v_pick_number, v_round, p_roster_slot
    );
  exception when unique_violation then
    raise exception 'that pick was already made' using errcode = 'P0001';
  end;

  v_next_pick := v_draft.current_pick + 1;
  v_is_complete := v_next_pick >= v_order_len;

  v_deadline := case
                  when v_is_complete then null
                  else now() + make_interval(secs => v_draft.pick_seconds)
                end;

  update drafts
     set current_pick = v_next_pick,
         status = case when v_is_complete then 'complete' else 'active' end,
         deadline_at = v_deadline
   where id = p_draft_id;

  if v_is_complete then
    update weeks set status = 'scoring' where id = v_draft.week_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'auto', true,
    'managerId', v_on_the_clock,
    'slot', p_roster_slot,
    'pickNumber', v_pick_number,
    'round', v_round,
    'currentPick', v_next_pick,
    'isComplete', v_is_complete,
    'deadlineAt', v_deadline
  );
end;
$$;

revoke all on function auto_pick(uuid, text, text) from public;
grant execute on function auto_pick(uuid, text, text) to authenticated;
