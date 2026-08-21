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
yet run. See [Command-line access](#command-line-access) below.

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
project was created, resettable under Project Settings → Database. `link`
writes `supabase/config.toml`, which should be committed, and a
`supabase/.temp/` cache, which should not.

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

**Push the two new environment variables to production.** `vercel env add`
reads the value from stdin, so it never echoes a secret into shell history:

```bash
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
printf '%s' "$CRON_SECRET"               | vercel env add CRON_SECRET production
```

Add `preview` and `development` as extra targets if you want preview
deploys to score too. To check what's already set:

```bash
vercel env ls
```

**Deploy:**

```bash
vercel                # preview deploy
vercel --prod         # production
vercel logs <url>     # tail a deployment, useful for debugging the crons
```

Crons only run on production deploys, and only after `CRON_SECRET` is set —
without it `verifyCronRequest` refuses every call, by design.

### Pulling env vars

`vercel env pull` **overwrites `.env.local`**. If you use it, write
somewhere else and merge by hand:

```bash
vercel env pull .env.vercel
```
