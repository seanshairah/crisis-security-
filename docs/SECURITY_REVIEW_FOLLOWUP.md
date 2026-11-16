# Security review follow-up

First remediation batch, 16 November 2026:

- Inbound SMS accepts only the configured provider. Shared-secret providers require `X-Webhook-Secret`; URL query secrets are no longer accepted. Missing/default secrets and missing Twilio/Sendai signatures fail closed. Configure the provider or trusted ingress to send this header before enabling those inbound integrations.
- Cron GET requires a bearer credential; a browser admin cookie alone cannot trigger it. Secret checks use constant-time digest comparisons.
- Default/missing production cron and automation secrets are fatal. Non-simulated SMS configurations also refuse missing/default webhook secrets.
- Android release tasks fail without a dedicated release keystore; debug testing continues independently.
- Next.js upgraded from 15.5.27 to 15.5.29 following the actual npm audit, which also identified GHSA-2464-fhr4-w9xw.
- Added GitHub CI with a disposable PostgreSQL service for type checking, lint, unit tests, migrations and the real patrol/setup integration scripts. This workflow has not yet been run on GitHub.

Remaining work from the review is not represented as fixed: shared database throttling and trusted proxy policy; bounded lateness and clock trust for offline evidence; PIN lockout fairness; API error classification and patrol batch limits; missed-alert reconciliation; formatting and consolidation of duplicate helpers/docs; CSP and deployment scheduler configuration.

The installed Android application ID is already `zw.co.crisis.security` (debug uses `.debug`). The legacy Kotlin namespace does not change that identity. QR v1 helper functions have test callers; they are not currently used by the production patrol flow. Static QR plus phone GPS is not hardware attestation, as documented in COORDINATE_PATROLS.md.

Second remediation batch:

- Added a persisted User tokenVersion and checked it on every portal session lookup. Password resets increment it through both admin update paths. Logout increments it for the account, invalidating all existing sessions, and accepts POST only.
- New session JWTs require the Crisis issuer/audience and version claim. Existing portal cookies require a new login after this update. Guard-device bearer tokens and patrol sessions are unaffected.
- Unknown-email logins now perform bcrypt comparison in both login handlers. New password hashes use cost 12; older hashes retain their existing cost, so this is not a claim of perfectly identical response timing.
- Added a real HTTP/PostgreSQL regression script: two independent cookies are rejected after password reset, a copied cookie fails after logout, and GET logout returns 405. The script passed against the disposable database. CI now builds and starts the isolated portal to run it.
- Applied the additive user-session migration to isolated Postgres and the separate connected Crisis database after a Crisis-only backup. No Omega records were changed.

Verification: 175 server unit tests passed, type checking and the production build passed, and the session revocation HTTP integration passed. Shared throttling, patrol clock/lateness policy and API error handling remain open.
