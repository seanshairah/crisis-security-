# Crisis Security

Crisis combines a Next.js/Prisma operations portal with a native Android company-phone app. Guards sign in individually for scheduled shifts, receive randomized patrol prompts, scan signed coordinate QR checkpoints and retain evidence through network outages. Operations manages sites, guards, shared handsets, attendance, alerts and reports.

The current Android build is **1.11.0**. Use this build for transport clock samples; older clients without them send evidence for clock review rather than automatic verification. Physical Pixel testing of 1.11.0 remains deferred by the user. Earlier physical test evidence applies to 1.9.5 only.

## Existing local installation

Open [Admin setup](http://localhost:3139/setup). Start the local server with `npm run local:start` or **Start Crisis.command**. Connect an authorized Android phone and run `npm run local:usb` for USB forwarding. Install the debug APK as an update, without uninstalling or clearing data. See [Admin quick start](docs/ADMIN_QUICK_START.md).

This installation uses the separate Crisis database. Do not reset, seed over, or migrate an Omega deployment. Private credentials, database backups, real QR signs, local device evidence and signing keys are excluded from public source uploads.

## Fresh development checkout

Use Node 22, PostgreSQL 16, Java 17 and Android SDK 35. Install with `npm ci`. Copy `.env.example` to a private `.env`, configure a separate Crisis database and replace all example secrets with independent private random values. Run `npx prisma migrate deploy`. On an empty database, `ADMIN_PASSWORD='your private password' npm run db:seed` creates baseline settings/templates and the administrator; the password must be at least 12 characters and fit within 72 UTF-8 bytes. Existing accounts are preserved.

Run `npm run build` and `npm run local:start`, or `npm run local:dev` during development. Configure a real HTTPS endpoint before production Android use. Release builds require the private signing configuration; CI uses a disposable signing identity solely to verify release builds. Production signing credentials and APK binaries are distributed separately from the public repository.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` and `npm run docs:api:check`. PostgreSQL-backed tests must use the disposable **crisis_test** database on loopback port **55439**. The full gateway suite requires the isolated portal on **localhost:3141**; safety checks reject other database/portal targets. CI provisions this environment and runs patrol/setup/security integrations, session-cookie replay tests, `test:all`, and Android debug/release checks.

See [the documentation index](docs/README.md), [security operations](docs/SECURITY_OPERATIONS.md), [generated patrol contracts](docs/generated/patrol-api.json), and [security review resolutions](docs/SECURITY_REVIEW_FOLLOWUP.md). Historical previews/audits are archived; the application uses real APIs and database records.

For persistent local/Docker hosting, use the in-process scheduler. Vercel requests a minute-capable cron; the optional GitHub automation job is a five-minute fallback and remains disabled until explicitly configured for Crisis. See the security guide for webhook headers, trusted ingress, evidence lateness and signing-key backups.
