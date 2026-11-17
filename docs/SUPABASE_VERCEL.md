# Supabase database on Vercel

The portal runs on Vercel with its PostgreSQL database on Supabase. Production deployments apply database migrations
and the baseline (settings, message templates, the super admin) automatically before building
(`scripts/vercel-build.mjs`); preview deployments never touch the database.

## 1. Create the database (Supabase)

1. supabase.com → **New project**. Name it `crisis-security`.
2. **Region: London (eu-west-2).** The app's Vercel functions run in London (`regions: ["lhr1"]` in `vercel.json`), so every
   query stays in one city. If you pick another region, change `regions` in `vercel.json` to the matching Vercel region
   (Frankfurt `eu-central-1` → `fra1`).
3. Set a strong database password and keep it in your password manager.
4. When the project is ready: **Connect** (top bar) → **ORMs** or **Connection string**. You need two strings:
   - **Transaction pooler** (host `aws-0-eu-west-2.pooler.supabase.com`, **port 6543**) → `DATABASE_URL`
   - **Session pooler** (same host, **port 5432**) → `MIGRATION_DATABASE_URL`

   Replace `[YOUR-PASSWORD]` in both. Do not use the `db.<ref>.supabase.co` direct address: on the free plan it is IPv6
   only, and Vercel's build machines may not reach it.

The app adds `pgbouncer=true&connection_limit=3` to the transaction-pooler URL itself (`src/lib/db-url.ts`), so the string
can be pasted as Supabase shows it.

## 2. Environment variables (Vercel)

Vercel → the project → **Settings → Environment Variables**, scope **Production**. Generate the secrets with:

```bash
node scripts/generate-secrets.mjs
```

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler string (port 6543) |
| `MIGRATION_DATABASE_URL` | Supabase session pooler string (port 5432) |
| `AUTH_SECRET`, `CRON_SECRET`, `AUTOMATION_SECRET`, `PATROL_QR_SIGNING_SECRET` | from `generate-secrets.mjs` |
| `ADMIN_EMAIL` | the first super admin's email |
| `ADMIN_PASSWORD` | from `generate-secrets.mjs` (needed on the first deploy only; change it after signing in) |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain` |
| `TRUST_PROXY_HOPS` | `1` (Vercel sets the client address itself) |
| `PATROL_WINDOW_LOOKAHEAD_MINUTES` | `auto` (see below) |
| `AUTOMATION_INPROCESS` | `false` (serverless: the cron below runs the engine) |
| `TIMEZONE` | `Africa/Harare` |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_WEBHOOK_SECRET` | your SMS gateway (see `.env.example`) |

Set the same `DATABASE_URL` for **Preview** only if previews should see production data; otherwise give previews their
own Supabase project (a Supabase branch) or leave it unset there.

## Using the Supabase integration's variables

If you added Supabase through Vercel's **Integrations**, Vercel already created `POSTGRES_URL` (transaction pooler) and
`POSTGRES_PRISMA_URL`. The app and the build use them automatically whenever `DATABASE_URL` or `MIGRATION_DATABASE_URL` is
missing or still holds a template placeholder such as `►PROJECT_REF►` or `<DB_PASSWORD>`: migrations run on the same
database through the session pooler (port 5432), and the build log says which variable it used. Setting the two variables
explicitly (as in the table above) always wins.

## 3. Deploy

Redeploy production (Deployments → … → Redeploy, or push to `main`). The build log shows:

```
Applying database migrations…
Ensuring settings, message templates and the super admin exist…
Baseline ready: settings, templates and the super admin.
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then open **Audit log** and check your `USER_LOGIN` row shows your real
public IP (that confirms `TRUST_PROXY_HOPS`).

To build without touching the database (for example while investigating), set `SKIP_DB_MIGRATIONS=true`.

## Automation schedule

`vercel.json` runs the automation engine every minute (`/api/automation/tick`, authorised with `CRON_SECRET`). Vercel's
**Hobby** plan only allows daily cron jobs and rejects the deploy otherwise. On Hobby, change the schedule to
`0 3 * * *` and turn on the GitHub workflow instead: repository **Settings → Secrets and variables → Actions**, add secrets
`APP_URL` and `AUTOMATION_SECRET`, and variable `CRISIS_AUTOMATION_ENABLED=true` (`.github/workflows/automation-tick.yml`,
every 5 minutes). On **Pro**, keep the per-minute cron.

## Patrol window look-ahead

`PATROL_WINDOW_LOOKAHEAD_MINUTES=auto` makes every site's **Deployment default** automatic: the guard phone holds the
next patrol check plus 30 minutes for lost signal (the site's longest gap + 30, between 45 and 120 minutes), never the
whole night. Sites where signal drops for long stretches should be switched to **Whole shift** in Sites → the site →
QR checkpoints & patrol timing. Details and trade-offs: `docs/DECISIONS.md` §2 and `src/lib/patrol/reveal.ts`.
