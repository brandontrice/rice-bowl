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

### 1. Run the database migration

In the Supabase SQL Editor for this project, run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
It creates every table, RLS policy, the auth-provisioning trigger, and
enables Realtime on the draft/trash-talk tables.

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

Already in `.env.local` for local dev (gitignored). For Vercel, set the same
two vars in the project's Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

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
   week's House Rule may restrict the pool (e.g. Division Lockdown), change
   a slot's eligibility (Flex Flip), or add a pre-draft action (Sniper).
3. **Matchup (`/week/[id]`)** — once the draft completes, rosters, scores,
   the House Rule banner, trash talk, and the wager ledger all live here.
   "Refresh scores" pulls Sleeper's weekly stats and recomputes points with
   the House Rule modifier applied; the week auto-finalizes (and a Bowl
   Point is awarded) once Sleeper's `state.week` moves past it.
4. **Season (`/season`)** — Bowl Point standings, week-by-week history, and
   the full wager ledger.

## House Rules

The full deck (with which are auto-enforced vs. honor-system) lives in
[`src/lib/house-rules.ts`](src/lib/house-rules.ts). Scoring math is in
[`src/lib/scoring.ts`](src/lib/scoring.ts); draft-pool/roster logic is in
[`src/lib/draft.ts`](src/lib/draft.ts).

## What's not in v1

Near-live in-game scoring (Sleeper's stats update after games, not during),
a pick timer, and anything that needs real-time team records or broadcast
schedule (Underdog Week, Primetime Only are honor-system for that reason).
See the original spec for the planned V2 (self-hosted Postgres, near-live
scoring worker, historical analytics, AI draft commentary, expanded deck,
December Playoff Bowl).
