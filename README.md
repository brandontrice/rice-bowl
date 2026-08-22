# Rice-Lay House

A two-manager, permanent-rivalry fantasy app. Rosters redraft from the live
NFL player pool every week via a snake draft; a House Rule card (dealt from
a ~20-card deck) modifies scoring, the draft pool, or the draft order each
week. Weekly winners earn a Bowl Point; season standings are the Bowl Point
tally.

## Stack

- Next.js 16 (App Router, Turbopack)
- Supabase (Postgres + Auth + Realtime)
- Sleeper's public API for the player pool and weekly stats (no key needed)
- Tailwind CSS v4

## The look

A field at night: deep turf ground, chalk-white type, goalpost yellow as
the single action colour. Faint yard markings sit behind the week's card
and the head-to-head, and nowhere else — put them everywhere and the
whole app buzzes.

Colour has jobs, and they don't overlap. Goalpost yellow means *do
something*. Mint, pale yellow, and red mean good, attention, and bad. The
two manager accents are structural only — the seam down the score bar,
the rail on a roster — and never carry meaning, because they come from
the database and either manager can change theirs.

Manager colours need to survive on turf. Magenta and sky both do, and
neither collides with the yellow or the mint. Everything in the palette
clears WCAG AA against the card surface; the small uppercase labels are
the tightest at 5.1, and they were the reason `--ink-faint` is lighter
than it first looks like it wants to be.

Each House Rule has its own emblem, drawn as inline SVG in
[`RuleEmblem.tsx`](src/components/RuleEmblem.tsx) — a padlock for Division
Lockdown, a crosshair for Sniper, a closed eye for Blind Draft. They are
hand-drawn rather than pulled from an icon set because half of these ideas
have no stock equivalent, and a set assembled from near-misses reads worse
than a small consistent one drawn on purpose. Each appears twice on a
card: once at readable size in the corner, and once oversized and faint
behind the text, so the deck is recognisable as a spread of faces before
any of it is legible.
## One-time setup

### 1. Run the database migrations

Run each file in [`supabase/migrations/`](supabase/migrations/) in order,
in the Supabase SQL Editor:

| Migration | Adds |
| --- | --- |
| `0001_init.sql` | Every table, RLS policy, the auth-provisioning trigger, Realtime on the draft/trash-talk tables |
| `0002_allowlist_read.sql` | Read access to `manager_allowlist` for the waiting room |
| `0003_atomic_pick_and_indexes.sql` | The `make_pick()` locking function, week-scoped indexes, Realtime on `weekly_scores`, and the `ppg`/`pos_rank` columns the draft board ranks by |
| `0004_pick_clock.sql` | `drafts.deadline_at` / `pick_seconds`, the `arm_draft_clock()` and `auto_pick()` functions, and `make_pick()` redefined to roll the clock forward |
| `0005_player_stats_and_news.sql` | `players.espn_id`, the `player_season_stats` / `player_week_stats` tables, and the `player_season_to_date` view behind the rankings browser |
| `0006_projections.sql` | `player_projections` plus `players.proj_ppg` / `proj_points` / `adp` for Sleeper's season projections and average draft position |
| `0007_reveal_and_lock.sql` | `weeks.locks_at` (the week's first kickoff) and the `week_reveals` table behind the face-down card |
| `0008_nfl_schedule.sql` | The `nfl_games` table behind `/schedule` — kickoff times, networks, venues and scores |
| `0009_game_time_tbd.sql` | `nfl_games.time_valid`, so flex-scheduled games show "Time TBD" rather than a midnight placeholder |
| `0010_player_lock.sql` | `player_is_locked()`, enforced inside `make_pick()` and `auto_pick()` so a kicked-off player can't be drafted |
| `0011_draft_ready.sql` | The `draft_ready` table and `set_draft_ready()`; `make_pick()` / `auto_pick()` now refuse while a draft is pending |
| `0012_keeps_and_evictions.sql` | `roster_keeps`, `draft_picks.kept`, and the `keep_player()` / `evict_player()` / `active_keeps()` functions |
| `0013_season_year_unique.sql` | A unique index on `seasons.year`, so concurrent week creation can't duplicate a season |

Only `0003` through `0013` are safe to re-run: they guard every statement
with `if not exists`, a `do` block, or `create or replace`.
`0001` and `0002` are not — between them they have 21 bare `create policy`
statements, a `create trigger`, and several `alter publication ... add
table`, all of which error if the object is already there.

This matters if you adopt the CLI after applying anything by hand. The
CLI tracks what it has run in `supabase_migrations.schema_migrations`,
and SQL Editor runs never touch that table, so `db push` would try to
replay everything. Record the hand-applied ones first:

```bash
npx --yes supabase@latest migration list                      # local vs remote
npx --yes supabase@latest migration repair --status applied 0001 0002
npx --yes supabase@latest db push                             # now applies only 0003
```

`migration repair` only writes to that bookkeeping table — it does not
run or alter any schema.

### 2. Seed the manager allowlist

Copy [`supabase/seed_allowlist.sql.example`](supabase/seed_allowlist.sql.example)
to `supabase/seed_allowlist.sql` (gitignored — it'll have real emails), fill
in your two real emails, display names, accent colors (hex), and favorite
teams (NFL team abbreviation, e.g. `KC`), then run it in the SQL Editor.

### 3. Sign up

With the allowlist seeded, both managers visit `/login`, toggle to "Sign
up", and use the exact emails from the allowlist. Supabase's default email
confirmation is on, so confirm via the emailed link (routes through
`/auth/confirm`) before signing in. A trigger auto-provisions your
`managers` row from the allowlist on confirmation.

### 4. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...        # browser + server
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # browser + server
SUPABASE_SERVICE_ROLE_KEY=...       # server only — never prefix with NEXT_PUBLIC
CRON_SECRET=...                     # any long random string
```

The first two are already in `.env.local`. The last two are new and are
what let background jobs run:

- `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings →
  API → `service_role`) lets the cron routes write without a signed-in
  user. It bypasses RLS, so it is only ever constructed inside
  secret-guarded routes.
- `CRON_SECRET` guards those routes. Vercel Cron sends it automatically as
  `Authorization: Bearer $CRON_SECRET` once the variable is set on the
  project; nothing else needs configuring.

Set all four in the Vercel project's Environment Variables.

### 5. Scheduled jobs

[`vercel.json`](vercel.json) registers two crons, picked up on the next
production deploy:

| Path | Schedule | Does |
| --- | --- | --- |
| `/api/cron/sync-players` | daily, 09:00 UTC | Refreshes the Sleeper pool and its points-per-game ranking |
| `/api/cron/score` | daily, 09:30 UTC | Rescores unfinished weeks and finalises any that have ended |

**Both are daily because Vercel's Hobby plan allows exactly one run per
day per cron.** Anything more frequent is rejected at deploy time:

```
Error: Hobby accounts are limited to daily cron jobs.
This cron expression (*/15 * * * *) would run more than once per day.
```

Daily is the right cadence for what these two actually have to guarantee:
the pool stays fresh, and a week gets finalised once Sleeper's
`state.week` moves past it. Neither needs to be timely to the minute.

**In-game scoring is handled by the page, not by cron.** Scores only
matter while someone is watching them, so an open and visible matchup tab
refreshes on a ~90-second interval; whichever manager's tab gets there
first writes, and Realtime pushes the result to the other. Background a
tab and it stops polling entirely. See
[`LiveScores`](src/components/LiveScores.tsx).

That leaves "Refresh" on the head-to-head as a manual nudge rather than
the only path — which is what it was in V1.

### 6. Server-side scoring on game days

[`.github/workflows/score.yml`](.github/workflows/score.yml) calls the same
`/api/cron/score` endpoint every 15 minutes during game windows, which is
what Vercel's Hobby plan will not do. The route does not care who invokes
it, only that the bearer token matches.

This is belt-and-braces rather than load-bearing — the matchup page
already refreshes itself while someone is watching. What the workflow adds
is scoring when *nobody* has a tab open, so the standings are current the
next time either manager looks.

**One setup step: give GitHub the shared secret.**

`CRON_SECRET` is one string that has to exist in three places that cannot
see each other:

| Where | Who reads it | How it got there |
| --- | --- | --- |
| `.env.local` | your machine, `npm run dev` | generated once |
| Vercel env vars | the deployed app, to check callers | `vercel env add` |
| GitHub repo secret | the workflow, to prove it's allowed | **still to do** |

The workflow sends it as `Authorization: Bearer …`; the app compares it to
its own copy and returns 401 on a mismatch. They only work if all three
strings are identical.

In the browser — this is GitHub's repository settings, not VS Code's and
not Vercel's:

1. Open <https://github.com/brandontrice/rice-bowl/settings/secrets/actions>
2. Click **New repository secret**
3. Name: `CRON_SECRET`
4. Secret: paste the value of `CRON_SECRET` from your local `.env.local`
5. **Add secret**

Or, with the [GitHub CLI](https://cli.github.com) installed
(`winget install GitHub.cli`), from the project directory:

```powershell
$value = (Select-String '^CRON_SECRET=' .env.local).Line -replace '^CRON_SECRET=', ''
$value | gh secret set CRON_SECRET --repo brandontrice/rice-bowl
```

Without it the workflow fails loudly on its first run rather than silently
doing nothing.

The production URL is baked into the workflow as a default. If the domain
ever changes, add an `APP_URL` repository *variable* rather than editing
the workflow.

**Schedule** (UTC — GitHub cron has no timezone support):

| Window | Covers |
| --- | --- |
| `*/15 17-23 * * 0` | Sunday early and late afternoon games |
| `*/15 0-4 * * 1` | Sunday night, which is already Monday in UTC |
| `*/15 0-4 * * 2` | Monday Night Football |
| `*/15 0-4 * * 5` | Thursday Night Football |

Deliberately not round-the-clock: 15-minute polling all week is roughly
2,900 billed Actions minutes a month against a 2,000-minute free
allowance for private repos. These windows come to about 430.

Two things worth knowing about GitHub's scheduler: runs are best-effort
and can be delayed by several minutes under load, and **scheduled
workflows are disabled automatically after 60 days without repo
activity** — an offseason risk more than an in-season one. `Run workflow`
on the Actions tab re-enables and tests it by hand.

**It must point at production.** Preview deployments sit behind Vercel's
Deployment Protection, which answers unauthenticated requests with a 302
to `vercel.com/sso-api` before any application code runs, so the workflow
cannot be pointed at a preview URL without a protection-bypass token.

## Tests

```bash
npm test          # once
npm run test:watch
```

[`src/lib/regressions.test.ts`](src/lib/regressions.test.ts) covers the
pure logic: PPR scoring with House Rules layered on it, slot assignment,
snake order shrinking as keeps accumulate, pool restrictions, and the two
Sleeper fields that lie.

Every case is either a rule the game would be broken without, or a bug
that actually shipped. The `999`-means-no-ADP trap and the `gp = 1` marker
on team defenses both reached production and were caught by reading
output rather than by anything automatic; both are one-line assertions
here. Vitest is the only dev dependency the project has picked up — the
application's own dependency list is still unchanged.

## Running locally

```bash
npm install
npm run dev
```

The first sign-in triggers everything else automatically: it deals the
current NFL week's House Rule (deterministically seeded — it can't be
re-rolled), builds the snake draft order, and syncs the Sleeper player pool
into `players` (re-synced automatically whenever the cache is >12h stale).

## How a week works

1. **Home (`/`)** resolves to the current NFL week and shows its House
   Rule card face down until you turn it over. Outside the regular season
   it shows a countdown to Week 1 instead — see [Preseason](#preseason).
2. **Draft room (`/week/[id]/draft`)** — snake draft, 8 slots
   (QB/RB/RB/WR/WR/TE/FLEX/DST), synced live via Supabase Realtime. The
   pool is ordered by average draft position and filterable by position or
   by "fills a slot". The week's House Rule may restrict the pool (e.g.
   Division Lockdown), change a slot's eligibility (Flex Flip), hide the
   opponent's board (Blind Draft), or add a pre-draft action (Sniper).
   Each pick commits through the `make_pick()` function, so the draft
   can't desync under a double-submit. An optional pick clock auto-drafts
   the best available player on expiry — see [The pick clock](#the-pick-clock).
3. **Matchup (`/week/[id]`)** — the dealt card, then the head-to-head, then
   rosters, trash talk, standings, and the wager ledger. While the tab is
   open the page refreshes scores on its own and they land over Realtime
   for both managers at once; "Refresh" is a manual nudge. The week
   auto-finalizes (and a Bowl Point is awarded) once Sleeper's
   `state.week` moves past it.
4. **Season (`/season`)** — Bowl Point standings, current streak,
   head-to-head record by rule category, week-by-week history, and the
   full wager ledger.
5. **Schedule (`/schedule`)** — every game of the season by week and day,
   with kickoff times, networks and live scores; filterable to one team.
6. **Deck (`/deck`)** — all 20 cards, with the ones already dealt this
   season marked.

## Preseason

The league plays weeks 1 through 18. During the preseason the *upcoming*
week is Week 1, so its card is dealt and its draft room is open well
before the opener — the draft is gated on both managers being ready, not
on the calendar. After the regular season there is nothing left to deal.

What is not done is read `state.week` directly. Sleeper counts preseason
weeks in it, so in August it reads 2, and `ensureCurrentWeek` used to act
on that: the first time both managers signed in during August it would
have created a competitive "Week 2", skipping Week 1 and settling the
rivalry on exhibition football where starters sit after a series.

The same counter had a second bite. `scoreWeek` decided a week was over
with `state.week > week_number`, which is true during the preseason for
Week 1 — so Week 1 would have been marked complete and a Bowl Point
awarded before a snap. Finalising now requires the regular season to have
moved past the week, or the season to be over.

Everything that reads the NFL rather than the rivalry keeps working
year-round: the schedule, the player rankings with last season's
production and this year's projections, and the deck. Only the drafting
waits.

## Starting a draft

Nobody picks until both managers have pressed **Start draft**.

The lobby tracks two separate things and shows both. *In the room* is live
Realtime presence — who has the draft room open right now. *Ready* is the
deliberate click, stored in `draft_ready`. Presence alone would start a
draft because somebody left a tab open overnight; readiness alone would
let you start into an empty room.

The flip from `pending` to `active` happens inside `set_draft_ready()`
under a row lock, so two simultaneous clicks can't start it twice. Both
`make_pick()` and `auto_pick()` refuse while the draft is `pending` — it
is a real gate, not a hidden button. The player pool stays shut too:
seeing who's available is half of drafting, and one manager browsing early
is a head start the other didn't get.

Before this, the draft began as a side effect of the first pick — whoever
opened the room first could draft into an empty room.

Backing out is possible while `pending` and refused afterwards; leaving
mid-draft would strand the other manager. If the pick clock was armed
while waiting, it restarts at the moment the draft goes live rather than
counting down from whenever the length was set.

## Keeps, Full House and Evictions

The league stops being a pure weekly redraft and starts accumulating a
team.

| After | You keep | Next week drafts |
| --- | --- | --- |
| Week 1 | 1 player | 7 |
| Week 2 | another | 6 |
| … | … | … |
| Week 8 | the eighth | 0 — **Full House** |

A keep is chosen off a *finished* week, from the roster that actually
played it: choosing on projection rather than on what happened would make
it a different, duller decision. One per week, and the choice is
permanent.

**Full House is where the twist starts.** With every slot kept there is
nothing left to draft, so from that point you must **evict** one resident
each week, and the next draft is exactly one pick long — their
replacement. The roster stops growing and starts turning over, one player
at a time, for the rest of the season. Evictions are confirmed rather than
one-click, because there is no undo once the next week is built.

**Last week's loser picks first.** Without it the manager who is ahead
compounds the advantage every week: better roster, better keeps, first
pick, forever.

Keeps are materialised into the new week as `draft_picks` rows with
`kept = true`, so scoring, the roster grid and the matchup page need no
idea keeps exist — a kept player is a pick that was already made. They sit
at negative `pick_number`, which keeps them unique against
`unique (draft_id, pick_number)`, sorts them ahead of the live picks, and
reads unmistakably as "not chosen at the board".

Two rules worth knowing:

- **A House Rule restricts what you may draft, never who you already
  signed.** Keeps are slotted from the base roster shape, so No-Fly Zone
  doesn't quietly strip a kept tight end off your team.
- **If you never choose, your best scorer from that week is kept for
  you.** The week rolls on Tuesday whether or not anyone opened the app,
  and a missing keep would stall the next draft.
## The week's rhythm

| When | What happens |
| --- | --- |
| **Tuesday** | Sleeper's `state.week` rolls. Last week finalises, a Bowl Point is awarded, and the next card is dealt **face down**. |
| **Tue → kickoff** | Both managers turn their card over, then draft under it. |
| **First kickoff** | The draft deadline. Usually Thursday night. |
| **Thu → Mon** | Games. Scores accumulate while anyone has the matchup open. |
| **Tuesday** | Round again. |

The card is dealt by the cron rather than by whoever visits first, so it
is waiting when you arrive rather than being created by your page load.
It stays put until the week rolls — the rule is seeded from the season and
week number, so it cannot be re-rolled by refreshing.

**The reveal is an act, not a page load.** The card arrives face down with
a chevron back and turns over when you press it. Recorded per manager on
the server rather than in `sessionStorage`, so it survives a new tab, a
new device, and a cleared browser — a card you can re-flip in an incognito
window is not really a reveal. The draft room redirects back to the
matchup page if you have not turned yours, since the House Rule is printed
at the top of it.

**The deadline is the real first kickoff**, not a hardcoded Thursday.
[`schedule.ts`](src/lib/schedule.ts) takes the earliest game of the week
from ESPN's scoreboard, because a fixed "Thursday 8:15 PM" is wrong more
often than you would think: in 2026 Week 1 opens on a **Wednesday**, so
does Week 12 on Thanksgiving, and Week 18 has no Thursday game at all.
The countdown renders client-side so it reads the same wherever either
manager happens to be.

## The player lock

A player is undraftable once **their own** game has kicked off — not once
the week's first game has. Taking a Sunday afternoon receiver at 9pm on
Thursday is fine. Taking the Thursday tight end who just posted 24 is not,
and `weeks.locks_at` was only ever a countdown: nothing consulted it when
a pick was made.

Enforced in Postgres, by `player_is_locked()` inside both `make_pick()`
and `auto_pick()`, because the UI is a suggestion. The board also greys
locked players out and labels the button `Locked` rather than hiding them
— a name that silently vanished mid-draft is a worse experience than one
you can see is gone. Auto-draft skips them too, so the clock hands over
the best *available* player rather than failing on the best one.

Players on a bye have no game row and stay draftable. They score nothing,
which is a choice the manager is allowed to make.

## Live game status

Every roster row on the matchup page says what its player's team is doing:
the kickoff time before the game, a pulsing marker and the period during
it, `Final` after, and `Bye` when they aren't playing at all. It answers
"why is this number still zero" without anyone going to look it up.

Rendered client-side. `RosterGrid` is a server component, so a kickoff
time formatted there would come out in the server's timezone — UTC on
Vercel — which is wrong for both managers.

## The NFL schedule

`/schedule` lists every game of the regular season: grouped by day within
a week, with kickoff time, network, venue, and live or final scores. Pick
any team to see all 17 of their games instead.

Cached into `nfl_games` rather than fetched per view. A team's season would
otherwise be eighteen upstream requests, and holding the rows locally makes
kickoff time, network and score all filterable in one query. The daily sync
pulls the whole season; the scoring path refreshes only the current week,
so live scores move without re-pulling the other seventeen.

Times are formatted client-side. The server would have to pick a timezone,
and a countdown or a kickoff time should read correctly for whichever
manager is looking at it.

Two upstream quirks worth knowing about.

ESPN abbreviates Washington `WSH` where Sleeper uses `WAS`, so team codes
are normalised on the way in and `nfl_games.home_team` lines up with
`players.team`.

And days are bucketed by their **Eastern** date, never the UTC one. A US
night game is already past midnight in UTC — New England at Seattle kicks
at 8:20 PM Eastern on a Wednesday and is stored as `2026-09-10T00:20Z` —
so reading the date off the ISO string puts roughly a fifth of the season
on the wrong day. Eastern is also the right bucket conceptually: the
league schedules in it, and "Thursday Night Football" is a Thursday game
wherever it is watched. Kickoff times still render in the viewer's own
zone and name it, so an Eastern day header and a Pacific time cannot look
like they disagree.

Games the NFL has not fixed a time for yet — all of Week 18 until late in
the season — carry `time_valid = false` and show "Time TBD" instead of the
midnight placeholder ESPN sends.

## House Rules

The full deck (with which are auto-enforced vs. honor-system) lives in
[`src/lib/house-rules.ts`](src/lib/house-rules.ts). Scoring math is in
[`src/lib/scoring.ts`](src/lib/scoring.ts); draft-pool/roster logic is in
[`src/lib/draft.ts`](src/lib/draft.ts).

## Scoring

**Full PPR** — a point per reception — and every House Rule is a modifier
layered on that base. So the base is load-bearing: under PPR, Workhorse
and Double Trouble are both worth noticeably more than they were at half,
because they multiply a bigger number.

Everything derived from production uses the same basis, or the app would
rank players by one scoring system and score them with another: the
`/players` rankings, the draft board's points per game, Sleeper's
projections, and the ADP the board and auto-draft order by.

Defenses use Sleeper's precomputed total rather than reimplementing
points-allowed tiers. PPR and half-PPR are identical for a unit that
catches no passes, so that is a consistency choice rather than an effect.

A useful sanity check when changing this: receivers should move and
quarterbacks should not. Switching to PPR moved Puka Nacua from 19.4 to
23.4 points a game and Trey McBride from 14.9 to 18.6, while Josh Allen
stayed at exactly 22.0.
## Player rankings and news

`/players` ranks the pool by last completed season's PPR points per game, with
this season's beside it as games are played. Click through to
`/players/[id]` for both seasons' totals, a week-by-week game log, and
recent news. Player names on the draft board and on the matchup rosters
link straight there.

**Where each number comes from.** Completed seasons are pulled wholesale
from Sleeper once and never change again, into `player_season_stats`. The
current season is assembled a week at a time into `player_week_stats`, and
its totals are a view (`player_season_to_date`) rather than a stored copy,
so there is no second number to drift. Between February and September the
current season is empty, so the game log falls back to last season's,
labelled as such.

**Why this year updates during games.** The matchup scoring path already
fetches the whole league's weekly stat lines to score the two rosters, so
it writes them to `player_week_stats` on the way past. That runs off the
matchup page's own polling, which means player pages move while games are
being played without a second scheduler.

**News is a best-effort extra**, from ESPN's athlete overview endpoint. If
it fails the page renders without it.

A warning if you ever touch this: ESPN's
`nfl/news?playerId=` endpoint looks like the right one and is not. It
answers 200 and silently ignores the filter, returning the same
league-wide feed for every player — it will look like it works.
`athletes/{id}/overview` is the endpoint that is genuinely scoped, and it
also carries the Rotowire fantasy note, which is usually the useful part.

Reaching it needs an ESPN athlete id. Sleeper carries one, but only for
about a fifth of the pool — Ja'Marr Chase and Amon-Ra St. Brown are both
missing one — so [`espn-ids.ts`](src/lib/espn-ids.ts) fills the gaps from
ESPN's 32 team rosters, matching on name and preferring the same team,
which is what keeps the two Josh Allens apart. That runs during the daily
sync and only for players still missing an id. Coverage is around 94% of
non-defense players; team defenses have no ESPN athlete record at all and
show no news by design.

### Projections and ADP

Sleeper publishes season and per-week projections on an undocumented but
stable endpoint, including average draft position. Both are pulled by the
daily sync into `player_projections` and mirrored onto `players` so the
lists can order by them without a join.

Projections show up in three places: a third card on the player profile
(alongside last season's actual and this season's to date), a `Proj`
column on the rankings list with ADP underneath, and a second line on
each draft-board row.

**The draft board and the auto-draft both order by ADP**, falling back to
projection, then last season's production, for the players who have no
ADP. One ordering, deliberately: if the board ranked players differently
from what the clock takes on an expiry, the "best available" tab would be
lying about what happens next.

ADP is the better signal for a draft — it is forward-looking where last
season's box scores are not, and the two disagree meaningfully.
McCaffrey is RB1 on 2025 production but fifth by ADP.

One trap if you touch this: Sleeper reports `gp: 18` for skill positions
in a season projection but `gp: 1` for team defenses, so dividing points
by it puts every defense at around 106 "points per game". `seasonGames()`
in [`projections.ts`](src/lib/projections.ts) treats anything under ten as
a unit marker rather than a game count.

## The pick clock

Off by default. There is no scheduled draft time in this league, so a
clock running from the moment a week is dealt would auto-draft an absent
manager's entire roster overnight. Either manager arms it from the draft
room — 60, 90, 120, or 180 seconds a pick — when they are both actually at
the board. Once armed it cannot be stopped, and every pick resets it.

When a deadline passes, the manager on the clock is given the **lowest-ADP
player still available** who is allowed by the week's House Rule and fits
a roster slot they have not filled. "Still available" and "fits a slot"
both matter: it will not hand you a third running back, and under
Division Lockdown it stays inside the locked division.

See [Projections and ADP](#projections-and-adp) for why ADP rather than
last season's points per game.

Enforcement is in Postgres, not the browser. `auto_pick()` refuses while
time remains, so neither manager can force the other's pick early, and it
runs under the same row lock as `make_pick()`, so two browsers racing the
same expiry produce one pick rather than two. Either manager's tab may
fire it — the one on the clock tries immediately, the opponent's waits
three seconds and acts only as a fallback for when the on-clock manager
has closed their tab. If nobody has a tab open, nothing happens until
somebody does; the clock is a convenience for a live draft, not a
background job.

## Still not in v1

Near-live in-game scoring — Sleeper posts stats after games rather than
during them.

**Player lock** is in: a player comes off the board the moment their own
game kicks off. See [The player lock](#the-player-lock).

**Underdog Week** stays honor-system: it needs live team records, and
nothing here tracks standings.

**Primetime Only no longer has to be.** It was honor-system because the
app had no broadcast schedule; `nfl_games.network` now carries one, so
"is this player in a nationally televised game" is a joinable question.
Turning it on would move a rule from honour to enforced, which changes how
a week can be played, so it is left as a decision rather than taken as a
default.

V2 is where the self-hosted Postgres, the near-live scoring worker,
historical analytics, AI draft commentary, an expanded deck, and the
December Playoff Bowl land.

## Command-line access

Two CLIs cover everything that isn't `npm run dev`: Supabase owns the
database, Vercel owns deploys and production environment variables.
Neither needs a global install — `npx --yes` fetches them on demand. (The
`--yes` matters: without it `npx` prompts, which fails in a non-interactive
shell.)

### Supabase CLI

**Log in.** Opens a browser and stores a token in your user profile, so
this is a one-time thing per machine:

```bash
npx --yes supabase@latest login
```

**Link this repo to the project.** The ref is the subdomain of
`NEXT_PUBLIC_SUPABASE_URL` — for `https://bsnsivjuajvwnsipeggf.supabase.co`
it's `bsnsivjuajvwnsipeggf`:

```bash
npx --yes supabase@latest link --project-ref bsnsivjuajvwnsipeggf
```

It prompts for the database password — the Postgres password set when the
project was created, resettable under Project Settings → Database.

On CLI 2.x, `link` stores its state in `supabase/.temp/` (gitignored) and
does not create a `config.toml`; you only get one by running
`supabase init`, which this project does not need since there is no local
Postgres in the loop.

**Day to day:**

```bash
npx --yes supabase@latest migration list   # local vs remote state
npx --yes supabase@latest db push          # apply anything not yet run
npx --yes supabase@latest db diff -f name  # capture dashboard edits as a migration
```

`db push` is the one that matters here — it applies
`0003_atomic_pick_and_indexes.sql` without pasting anything into the SQL
Editor.

### Vercel CLI

Already installed globally and already authenticated as `brandontrice`;
this repo is linked to the `rice-bowl` project, so `.vercel/project.json`
exists locally (gitignored). If you ever need to redo it:

```bash
vercel login
vercel link --yes --project rice-bowl
```

> `vercel link` appends `VERCEL_OIDC_TOKEN` to `.env.local`. It only adds
> that one line, but it is worth knowing before running it against a file
> you care about.

**Push environment variables to Vercel.** `vercel env add` takes the value
on stdin, so the secret never lands in shell history. Two gotchas: the
default shell here is PowerShell, which has no `printf`; and the values
live in `.env.local`, not in your environment, so `$NAME` is empty unless
you read the file first.

PowerShell:

```powershell
foreach ($name in 'SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET') {
  $value = (Select-String "^$name=" .env.local).Line -replace "^$name=", ''
  foreach ($target in 'production','preview') {
    $value | vercel env add $name $target
  }
}
```

Git Bash, if you prefer it:

```bash
for name in SUPABASE_SERVICE_ROLE_KEY CRON_SECRET; do
  value=$(grep "^${name}=" .env.local | cut -d= -f2-)
  for target in production preview; do
    printf '%s' "$value" | vercel env add "$name" "$target"
  done
done
```

Both are already set on this project for Production and Preview. To see
what's there:

```bash
vercel env ls
```

Crons only fire on Production, but the service-role key is also used by
the draft page's background player sync, which runs on preview deploys
too — hence both targets.

**Deploy:**

```bash
vercel                # preview deploy
vercel --prod         # production
vercel logs <url>     # tail a deployment, useful for debugging the crons
```

### Pulling env vars

`vercel env pull` **overwrites `.env.local`**. If you use it, write
somewhere else and merge by hand:

```bash
vercel env pull .env.vercel
```
