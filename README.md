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

Only `0003` is safe to re-run: it guards every statement with `if not
exists` or a `do` block. `0001` and `0002` are not — between them they
have 21 bare `create policy` statements, a `create trigger`, and several
`alter publication ... add table`, all of which error if the object is
already there.

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
   rosters, trash talk, standings, and the wager ledger. While the tab is
   open the page refreshes scores on its own and they land over Realtime
   for both managers at once; "Refresh" is a manual nudge. The week
   auto-finalizes (and a Bowl Point is awarded) once Sleeper's
   `state.week` moves past it.
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
