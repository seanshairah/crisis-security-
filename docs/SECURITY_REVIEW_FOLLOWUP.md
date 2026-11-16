# Security review follow-up

First remediation batch, 16 November 2026:

- Inbound SMS accepts only the configured provider. Shared-secret providers require `X-Webhook-Secret`; URL query secrets are no longer accepted. Missing/default secrets and missing Twilio/Sendai signatures fail closed. Configure the provider or trusted ingress to send this header before enabling those inbound integrations.
- Cron GET requires a bearer credential; a browser admin cookie alone cannot trigger it. Secret checks use constant-time digest comparisons.
- Default/missing production cron and automation secrets are fatal. Non-simulated SMS configurations also refuse missing/default webhook secrets.
- Android release tasks fail without a dedicated release keystore; debug testing continues independently.
- Next.js upgraded from 15.5.27 to 15.5.29 following the actual npm audit, which also identified GHSA-2464-fhr4-w9xw.
- Added GitHub CI with a disposable PostgreSQL service for type checking, lint, unit tests, migrations and the real patrol/setup integration scripts. This workflow has not yet been run on GitHub.

Remaining work from the review is not represented as fixed: shared database throttling and trusted proxy policy; bounded lateness and clock trust for offline evidence; session revocation and login timing; PIN lockout fairness; API error classification and patrol batch limits; missed-alert reconciliation; formatting and consolidation of duplicate helpers/docs; CSP and deployment scheduler configuration.

The installed Android application ID is already `zw.co.crisis.security` (debug uses `.debug`). The legacy Kotlin namespace does not change that identity. QR v1 helper functions have test callers; they are not currently used by the production patrol flow. Static QR plus phone GPS is not hardware attestation, as documented in COORDINATE_PATROLS.md.
