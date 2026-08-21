-- Lets a signed-in manager see the manager_allowlist (needed for the
-- "waiting on the other manager" screen, which shows who's expected but
-- hasn't signed up yet). Safe in a trusted two-person league.

create policy "managers can read manager_allowlist" on manager_allowlist
  for select using (is_manager());

-- Lets the "waiting on the other manager" screen auto-transition via
-- Realtime the moment the second manager signs up, instead of requiring
-- a manual refresh.
alter publication supabase_realtime add table managers;
