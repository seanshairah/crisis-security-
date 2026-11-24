# Go-live checklist and runbook (2026-11-22)

State of `main` after the Gate Inventory merge. "Verified" means run in this repository's CI or on a real database;
"Owner action" means it can only be done in your Vercel, Supabase, inventory system or on a phone.

## Verified

| Area                                  | Evidence                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Portal typecheck, lint, format, build | CI `portal` job                                                                            |
| Portal unit tests                     | 204 passing                                                                                |
| Dependency advisories                 | `npm audit`: 0 vulnerabilities (production and dev)                                        |
| Gate integration on a fresh migration | 42 checks: signatures, replay, ordering, parking, cancel, status poll, offline idempotency |
| Android unit tests, debug assembly    | CI `android` job                                                                           |
| Android layout snapshots              | Paparazzi, `record-screenshots` label                                                      |
| Migrations                            | additive only (`20261122090000_gate_inventory`, `20261123090000_gate_integration`)         |

## Owner actions before guards rely on it

1. **Vercel env (Production)** — `DATABASE_URL` (transaction pooler 6543 with `?pgbouncer=true`), `MIGRATION_DATABASE_URL`
   (session pooler 5432), `AUTH_SECRET`, `CRON_SECRET`, `AUTOMATION_SECRET`, `TRUST_PROXY_HOPS=1`,
   `NEXT_PUBLIC_APP_URL` (not marked sensitive). See `SUPABASE_VERCEL.md`.
2. **Inventory link** (only when the inventory system is ready) — `GATE_OUTBOUND_URL`, `GATE_OUTBOUND_TOKEN`,
   `GATE_OUTBOUND_SIGNING_SECRET`, `GATE_INBOUND_TOKEN`, `GATE_INBOUND_SITE_IDS`; optional
   `GATE_INBOUND_SIGNING_SECRET`, `GATE_MAX_ATTEMPTS`. Give the inventory team `GATE_INTEGRATION.md` and the OpenAPI file.
   Until set, gate decisions are held safely and the admin panel says **Not connected**.
3. **Scheduler** — `vercel.json` runs `/api/automation/tick` every minute, which needs Vercel **Pro**. On Hobby,
   use an external scheduler (cron-job.org or GitHub Actions) calling the endpoint with `CRON_SECRET`; see `SCHEDULER.md`.
4. **Deployment Protection** — turn off for Production so guard phones and the inventory system can reach `/api/*`.
5. **Supabase backups** — enable daily backups (Pro) or schedule a `pg_dump`; test one restore. Point-in-time recovery
   is the only protection against a bad migration after the fact.
6. **Phone** — install the release build on one guard phone and walk an arrival and a departure, online and in airplane
   mode (`DEVICE_TEST_PLAN.md`). Snapshots are not a substitute for a real device.
7. **Release signing** — a release APK requires the existing production keystore. Preserve it if already configured;
   otherwise create it once on your own machine: `npm run android:keystore` (see `APK_DISTRIBUTION.md`). Back up the configured keystore and the
   passwords in `android/keystore.properties` somewhere safe; losing the key means reinstalling the app on every phone.
   To build signed APKs on GitHub instead of your laptop, add the four secrets below and run the **Release APK** workflow.

## Runbook: inventory deliveries

Open **Gate Inventory** as an admin. The _Inventory connection_ panel shows waiting, retrying, needs-attention and delivered counts.

| Symptom                                | Meaning                                                 | Action                                                                        |
| -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| "Not connected"                        | An env var is missing or `http://` is used              | Fix the listed variable, redeploy, press **Send test**                        |
| Send test returns HTTP 401             | Token or signing secret differs from the receiver's     | Re-agree both secrets; rotate on both sides                                   |
| Counts show _Retrying_ growing         | Receiver down or slow (>10 s)                           | Wait; it backs off to hourly and keeps trying                                 |
| _Needs attention_ > 0 + critical alert | Receiver refused the record, or `GATE_MAX_ATTEMPTS` hit | Fix the cause, open the movement, press **Retry delivery** (resets the count) |
| Guard sees "Not cleared"/"Review"      | Gate decision, independent of delivery                  | Supervisor decides in the portal                                              |

Gate clearance never waits on the inventory system. Rotating a secret: set the new value on the receiver first when it
accepts both, then on the portal, then **Send test**.

## Rollback

- **App**: Vercel → Deployments → promote the previous deployment. Migrations are additive and the previous build ignores the new columns and the `CANCELLED` value.
- **Database**: restore the backup taken before the release (step 5). Do not run `migrate reset` on production.
- **Inventory link**: remove `GATE_OUTBOUND_URL`; decisions queue and send when it returns.

## Known limits

- The real inventory system's API has not been seen. The contract here is ours; mapping it to theirs is on their side or a small adapter.
- Guard device clocks are not trusted alone: a record more than 15 minutes old, or captured after the shift window, always goes to a supervisor.
- A withdrawn (cancelled) record can only be withdrawn before a guard checks it.
- Camera scanning of gate/movement QR codes is unverified on hardware.

## Signed release APK from GitHub

After running `npm run android:keystore` on your machine, add these repository secrets (Settings → Secrets and variables → Actions):

| Secret                      | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 contents of the configured `ANDROID_KEYSTORE_PATH` (macOS: `base64 -i /path/to/key`)        |
| `ANDROID_KEYSTORE_PASSWORD` | `ANDROID_KEYSTORE_PASSWORD` from `android/keystore.properties` |
| `ANDROID_KEY_ALIAS`         | `ANDROID_KEY_ALIAS` from the same file (new keys default to `crisis`)                           |
| `ANDROID_KEY_PASSWORD`      | `ANDROID_KEY_PASSWORD` from the same file                      |

Then run **Actions → Release APK → Run workflow**. It builds `app-release.apk`, prints the signing certificate
fingerprint (compare it with the one the keystore script printed) and attaches the APK as a build artifact.
The key never enters the repository or the logs.
