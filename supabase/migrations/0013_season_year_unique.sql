-- ═════════════════════════════════════════════════════════════════════════
-- 0013 — One season row per year
--
-- ensureCurrentWeek reads a season with maybeSingle() and inserts if it
-- finds none. It now runs from the cron and from page loads, so two
-- concurrent calls could each insert a row for the same year — after which
-- maybeSingle() throws on every subsequent read and the league stops dead.
-- ═════════════════════════════════════════════════════════════════════════

-- Collapse any duplicates before the constraint goes on.
delete from seasons s
using seasons keep
where s.year = keep.year
  and s.id <> keep.id
  and keep.created_at <= s.created_at
  and not exists (select 1 from weeks w where w.season_id = s.id);

create unique index if not exists seasons_year_key on seasons (year);
