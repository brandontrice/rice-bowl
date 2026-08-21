# The Rice Bowl

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

## One-time setup

### 1. Run the database migrations

Run each file in [`supabase/migrations/`](supabase/migrations/) in order,
in the Supabase SQL Editor:

| Migration | Adds |
| --- | --- |
| `0001_init.sql` | Every table, RLS policy, the auth-provisioning trigger, Realtime on the draft/trash-talk tables |
| `0002_allowlist_read.sql` | Read access to `manager_allowlist` for the waiting room |
| `0003_atomic_pick_and_indexes.sql` | The `make_pick()` locking function, week-scoped indexes, Realtime on `weekly_scores`, and the `ppg`/`pos_rank` columns the draft board ranks by |

All three are idempotent, so re-running them is safe.

Alternatively, with the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
installed and the project linked, `supabase db push` applies anything not
yet run. See [Working with migrations](#working-with-migrations) below.

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

[`vercel.json`](vercel.json) registers two crons, which Vercel picks up on
the next deploy:

| Path | Schedule | Does |
| --- | --- | --- |
| `/api/cron/sync-players` | daily, 09:00 UTC | Refreshes the Sleeper pool and its points-per-game ranking |
| `/api/cron/score` | every 15 min | Rescores unfinished weeks and finalises any that have ended |

Scoring no longer depends on someone pressing "Refresh" — that button is
still there, but it is now a manual nudge rather than the only path.

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

1. **Home (`/`)** resolves to the current NFL week, dealing its House Rule
   and draft the first time either manager visits.
2. **Draft room (`/week/[id]/draft`)** — snake draft, 8 slots
   (QB/RB/RB/WR/WR/TE/FLEX/DST), synced live via Supabase Realtime. The
   pool is ranked by season points per game and filterable by position or
   by "fills a slot". The week's House Rule may restrict the pool (e.g.
   Division Lockdown), change a slot's eligibility (Flex Flip), hide the
   opponent's board (Blind Draft), or add a pre-draft action (Sniper).
   Each pick commits through the `make_pick()` function, so the draft
   can't desync under a double-submit.
3. **Matchup (`/week/[id]`)** — the dealt card, then the head-to-head, then
   rosters, trash talk, standings, and the wager ledger. Scores arrive on
   their own via cron and land over Realtime for both managers at once;
   "Refresh" is a manual nudge. The week auto-finalizes (and a Bowl Point
   is awarded) once Sleeper's `state.week` moves past it.
4. **Season (`/season`)** — Bowl Point standings, current streak,
   head-to-head record by rule category, week-by-week history, and the
   full wager ledger.
5. **Deck (`/deck`)** — all 20 cards, with the ones already dealt this
   season marked.

## House Rules

The full deck (with which are auto-enforced vs. honor-system) lives in
[`src/lib/house-rules.ts`](src/lib/house-rules.ts). Scoring math is in
[`src/lib/scoring.ts`](src/lib/scoring.ts); draft-pool/roster logic is in
[`src/lib/draft.ts`](src/lib/draft.ts).

## Still not in v1

A **pick timer** — the draft board has room for one, and
`drafts.deadline_at` plus the existing Realtime channel would carry it,
but it needs a rules decision first: what happens when the clock hits
zero? Auto-draft the top-ranked eligible player, or just let it run red?
That's a league call, not a code one.

Near-live in-game scoring (Sleeper posts stats after games, not during),
and anything needing real-time team records or the broadcast schedule —
Underdog Week and Primetime Only stay honor-system for that reason.

V2 is where the self-hosted Postgres, the near-live scoring worker,
historical analytics, AI draft commentary, an expanded deck, and the
December Playoff Bowl land.

## Working with migrations

Right now migrations are applied by pasting SQL into the Supabase SQL
Editor. Wiring up the CLI means new `.sql` files can be applied with one
command instead — including by an agent working in this repo.

### One-time setup

```bash
npm install -D supabase          # or: scoop install supabase
npx supabase login               # opens a browser, stores a token
npx supabase link --project-ref <project-ref>
```

Two things are needed and neither is in the repo yet:

1. **Project ref** — the subdomain of your Supabase URL. Given
   `https://abcdefghijkl.supabase.co`, the ref is `abcdefghijkl`.
2. **Database password** — the Postgres password chosen when the project
   was created (resettable under Project Settings → Database). `link`
   prompts for it and caches it locally.

`link` writes `supabase/config.toml` and a `.temp/` directory. Commit
`config.toml`; `.temp/` is already covered by `.gitignore`.

### Day to day

```bash
npx supabase db push          # apply migrations the remote hasn't run
npx supabase migration list   # show local vs remote state
npx supabase db diff -f name  # capture dashboard changes as a migration
```

### For non-interactive / agent use

`supabase login` needs a browser, and `link` prompts for the password —
neither works unattended. To allow both without a prompt, set:

```
SUPABASE_ACCESS_TOKEN=sbp_...    # Account → Access Tokens
SUPABASE_DB_PASSWORD=...         # the Postgres password
```

With those exported, `supabase link --project-ref <ref>` and
`supabase db push` run without interaction. Treat `SUPABASE_ACCESS_TOKEN`
as a full-account credential — it is not scoped to one project, so prefer
a token you can revoke.

The alternative, if you would rather not hand over an account token: a
direct connection string (Project Settings → Database → Connection
string, "URI") used with `psql`, which is scoped to just this database:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_atomic_pick_and_indexes.sql
```
