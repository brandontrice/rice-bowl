-- ═════════════════════════════════════════════════════════════════════════
-- 0009 — Games whose kickoff time isn't set yet
--
-- The NFL flexes late-season games, so ESPN carries them with a midnight
-- placeholder and `timeValid: false`. Every game in Week 18 is like this
-- until the schedule firms up, and rendering the placeholder as "12:00 AM"
-- reads as a real midnight kickoff.
-- ═════════════════════════════════════════════════════════════════════════

alter table nfl_games add column if not exists time_valid boolean not null default true;
