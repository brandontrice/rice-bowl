-- ═════════════════════════════════════════════════════════════════════════
-- 0004 — The pick clock
--
-- A per-pick deadline, and an auto-draft that takes the top-ranked
-- eligible player when it expires.
--
-- The clock is *armed* rather than always-on. There is no scheduled draft
-- time in this league, so a clock that started the moment a week was dealt
-- would auto-draft an absent manager's entire roster overnight. Either
-- manager arms it when they are both actually sitting down to draft; until
-- then the draft behaves exactly as it did before.
-- ═════════════════════════════════════════════════════════════════════════

alter table drafts add column if not exists deadline_at timestamptz;
alter table drafts add column if not exists pick_seconds int not null default 90;

-- ─────────────────────────────────────────────────────────────────────────
-- arm_draft_clock() — start the clock for the pick currently on the board
-- ─────────────────────────────────────────────────────────────────────────

create or replace function arm_draft_clock(p_draft_id uuid, p_seconds int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft drafts%rowtype;
begin
  if not is_manager() then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_seconds is null or p_seconds < 15 or p_seconds > 600 then
    raise exception 'pick length must be between 15 and 600 seconds'
      using errcode = 'P0001';
  end if;

  select * into v_draft from drafts where id = p_draft_id for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status = 'complete' then
    raise exception 'draft is already complete' using errcode = 'P0001';
  end if;

  update drafts
     set pick_seconds = p_seconds,
         deadline_at = now() + make_interval(secs => p_seconds)
   where id = p_draft_id;

  return jsonb_build_object('ok', true, 'pickSeconds', p_seconds);
end;
$$;

revoke all on function arm_draft_clock(uuid, int) from public;
grant execute on function arm_draft_clock(uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- make_pick() — as in 0003, but now rolls the clock forward on each pick
--
-- Redefined in full rather than patched so the function has one readable
-- definition rather than a history you have to replay.
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

  -- Only roll the clock forward if it was armed in the first place.
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
-- auto_pick() — commit a pick on behalf of whoever the clock ran out on
--
-- Distinct from make_pick() because the caller is deliberately *not*
-- required to be the manager on the clock: the opponent's browser is often
-- the only one still open when a deadline passes. The deadline itself is
-- the authorisation — the function refuses while time remains, so neither
-- manager can use it to force the other's pick early.
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

  -- One second of slack absorbs clock skew between the browser and the
  -- database without meaningfully shortening anyone's pick.
  if now() < v_draft.deadline_at - interval '1 second' then
    raise exception 'there is still time on the clock' using errcode = 'P0001';
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
    -- Both browsers raced the same expiry; the other one already landed it.
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
