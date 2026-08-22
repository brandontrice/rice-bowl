-- ═════════════════════════════════════════════════════════════════════════
-- 0011 — Both managers have to say go
--
-- The draft used to begin the moment someone made a pick: status went from
-- 'pending' to 'active' as a side effect of the first selection. Whoever
-- opened the room first could start drafting into an empty room.
--
-- Now both managers mark themselves ready and the draft flips to 'active'
-- only when the last of them does. Picking before that is refused here,
-- not just hidden in the UI.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists draft_ready (
  draft_id uuid not null references drafts (id) on delete cascade,
  manager_id uuid not null references managers (id) on delete cascade,
  ready_at timestamptz not null default now(),
  primary key (draft_id, manager_id)
);

alter table draft_ready enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'draft_ready' and policyname = 'managers can read draft_ready'
  ) then
    create policy "managers can read draft_ready" on draft_ready
      for select using (is_manager());
  end if;
end
$$;

-- Writes go through set_draft_ready() so readiness and the status flip
-- happen under one lock; no direct insert/delete policy is granted.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'draft_ready'
  ) then
    alter publication supabase_realtime add table draft_ready;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- set_draft_ready() — mark yourself ready, and start when everyone is
-- ─────────────────────────────────────────────────────────────────────────

create or replace function set_draft_ready(p_draft_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft   drafts%rowtype;
  v_ready   int;
  v_total   int;
  v_started boolean := false;
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

  if p_ready then
    insert into draft_ready (draft_id, manager_id)
    values (p_draft_id, auth.uid())
    on conflict (draft_id, manager_id) do nothing;
  else
    -- Backing out is only possible before it starts. Once the board is
    -- live, leaving would strand the other manager mid-draft.
    if v_draft.status <> 'pending' then
      raise exception 'the draft has already started' using errcode = 'P0001';
    end if;
    delete from draft_ready where draft_id = p_draft_id and manager_id = auth.uid();
  end if;

  select count(*) into v_ready from draft_ready where draft_id = p_draft_id;
  select count(*) into v_total from managers;

  if v_draft.status = 'pending' and v_total > 0 and v_ready >= v_total then
    update drafts
       set status = 'active',
           -- If the clock was armed while waiting, restart it now: the
           -- deadline should measure from the first pick being live, not
           -- from whenever somebody set the length.
           deadline_at = case
                           when deadline_at is null then null
                           else now() + make_interval(secs => pick_seconds)
                         end
     where id = p_draft_id;
    v_started := true;
  end if;

  return jsonb_build_object(
    'ready', v_ready,
    'total', v_total,
    'started', v_started,
    'status', case when v_started then 'active' else v_draft.status end
  );
end;
$$;

revoke all on function set_draft_ready(uuid, boolean) from public;
grant execute on function set_draft_ready(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- make_pick() / auto_pick() — as in 0010, plus "the draft has started"
--
-- Redefined in full because Postgres has no way to patch a function body.
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

  if v_draft.status = 'pending' then
    raise exception 'the draft has not started — both managers need to be ready'
      using errcode = 'P0001';
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

  -- The clock cannot run before the draft does.
  if v_draft.status = 'pending' then
    raise exception 'the draft has not started' using errcode = 'P0001';
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
