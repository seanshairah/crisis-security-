# Crisis security and deployment

This is the current security reference. Historical audits are under `archive/`; request contracts for patrols are generated from Zod in [generated/patrol-api.json](generated/patrol-api.json). Run `npm run docs:api:check` and `npm run format:check` before publishing.

## Deployment and trusted ingress

Use a separate Crisis database, private random AUTH/CRON/AUTOMATION and provider webhook secrets, and an HTTPS endpoint for production Android phones. Production refuses example secrets. HTTP localhost and USB forwarding are for the debug APK. No Omega deployment or database records are changed by this source.

`TRUST_PROXY_HOPS=0` ignores forwarded IP headers. For a controlled reverse proxy, configure the exact number of trusted hops and ensure ingress overwrites/appends X-Forwarded-For. The address is selected from the right, not the client-controlled first entry. Do not enable header trust on an unprotected directly reachable server. When the source cannot be trusted, login falls back to a per-account budget of 30 failures per 15 minutes (no shared bucket, so a stranger cannot lock everyone out) and activation to a generous shared brake plus its per-code budget; `checkEnv` warns in production until `TRUST_PROXY_HOPS` is set. Logging out revokes every session of that account on all devices (the session `tokenVersion` is incremented), by design.

All gateway rate limits use atomic PostgreSQL counters shared across processes, with indexed expiry and bounded cleanup. Counter keys are hashed. Database failures do not fall back to an unlimited in-memory counter. Portal login consumes source and source/account budgets before password verification, without an account-wide lock that an unrelated address can trigger. PIN attempts are limited per company-device/guard pair plus a device request budget; other guards on that phone and that guard on another phone retain their own budgets. New activation codes contain 10 unambiguous characters, with source and per-code budgets. Existing unexpired activation codes retain their original value.

New PINs reject repeated and sequential digits; use a random 8–12 digit PIN where practical. Existing salted scrypt credentials remain readable. A PIN authenticates possession of that credential; an administrator who issued/reset it is trusted and this is not cryptographic proof of a human's identity. Treat the credential database as sensitive even with salted memory-hard hashes.

## Evidence and phone clocks

The updated Android uploader sends its current clock sample with every batch. Server receipt time supplies an offset, applied to both QR-read and GPS-fix times. Original times and the applied offset are retained alongside normalized evidence. Event deduplication uses the immutable original payload, so a retry with a different transport clock sample cannot create another patrol completion.

Evidence older than twice its assignment response window (minimum two minutes) becomes `DELAYED_REVIEW`. Missing/invalid clock samples become `CLOCK_UNCERTAIN` when the other checks would otherwise pass. These events remain stored and visible for operations review and do not automatically complete a patrol or produce a green verification notification. Older APKs without the new clock sample need updating for automatic verification.

Batches accept at most 100 submitted rows and process at most 20 per request. Each committed row has its own receipt. Invalid evidence receives a safe rejection; transient failures retain retry rows and stop further processing. The handset keeps all unacknowledged rows. The new Android uploader submits 20 at a time. Review outcomes do not discard evidence.

A valid delayed receipt within the allowed bound can reconcile its exact missed-window notification to an informational evidence-received state. The original scan remains immutable and marked with its receipt/capture times. Existing historical notifications without assignment identity are preserved.

Signed coordinate QR codes reject changed coordinates and copies scanned away from their original fence using an honest GPS fix. Poor accuracy, mock fixes and stale/cross-session positions cannot verify a patrol. Static codes can still be photographed. Self-reported time/GPS from a compromised or rooted phone is not hardware attestation. No Play Integrity service or hardware attestation is claimed by this build; bounded offline review and operational supervision are the implemented trust policy. Fully offline evidence cannot prove absence of device compromise.

## Portal sessions and errors

Production HTTPS uses the `__Host-crisis_session` cookie; localhost keeps `crisis_session`. Tokens require issuer/audience and a database version. Password reset and logout invalidate existing sessions; logout accepts POST only. New passwords require 12 characters and at most 72 UTF-8 bytes. New hashes use bcrypt cost 12, with older hashes upgraded after a successful login. Unknown accounts still perform password verification.

Expected validation/domain errors use 400/404/409/429 responses. Unexpected failures return generic 500/503 messages and are logged server-side, without echoing Prisma details to the client. The CSP constrains resource origins, objects, framing, base URIs and form targets; Next.js currently needs inline script/style allowances, so this is a baseline CSP, not a claim that inline XSS is impossible.

## Scheduler

For the persistent local/Docker deployment, use `AUTOMATION_INPROCESS=true`. Vercel configuration now requests a minute cron and requires a plan capable of that frequency plus CRON_SECRET. The optional GitHub workflow is explicitly a five-minute fallback, runs one bounded tick with concurrency control, and remains disabled until `CRISIS_AUTOMATION_ENABLED=true` is configured for the separate Crisis endpoint. No deployment/provider account settings are changed automatically.

## Direct APK signing

The release application ID is `zw.co.crisis.security`; debug uses `zw.co.crisis.security.debug`. Kotlin code now uses the Crisis namespace as well. SQLite names, preferences and application IDs are retained for updates. The two variants can coexist; do not uninstall or clear the test app to install an update. Sync debug evidence before activating a production replacement.

A dedicated release key was created in the owner's private `~/.config/crisis-security/signing/` directory. Android signing properties and recovery material are excluded from Git and Docker contexts. The local encrypted recovery copy is on the same machine; the owner should back up the keystore and password securely off this machine. Do not regenerate the key for future versions. Debug builds retain their existing debug certificate; production updates must retain the release certificate.

Release tasks fail if release signing configuration is absent. The release APK must use an HTTPS backend and receive a physical device test before company rollout. APK files and private signing credentials are distributed separately from the public source repository. There is no Play Store requirement.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run docs:api:check`, the isolated patrol/setup/security integration scripts, and the HTTP session revocation regression. CI supplies disposable PostgreSQL on loopback port 55439 and also runs Android JVM tests and a debug build. Physical device tests and deployment credentials are separate from CI; reports identify simulated/emulator evidence explicitly.


## Content Security Policy

Pages get a fresh nonce on every request (`src/middleware.ts`, policy in `src/lib/security/csp.ts`). Scripts run only with that nonce
(`'strict-dynamic'` lets a trusted script load the map libraries), so `'unsafe-inline'` is no longer allowed for scripts. Styles keep
`'unsafe-inline'`, because React style props and the map libraries set inline styles and a style cannot run code. API responses get
`default-src 'none'`. Leaflet's stylesheet is bundled from npm rather than loaded from a CDN. When adding a third-party script or an
external host, add it to `csp.ts` and check the browser console for "Refused to" on the affected page.
