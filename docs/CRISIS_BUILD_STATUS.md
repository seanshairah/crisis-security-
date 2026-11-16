# Crisis Security — staged build status

This is an isolated source clone of Omega. Database provisioning is intentionally deferred.

## Delivered in the initial milestone
- Independent web project name, Crisis Security portal brand, grey/charcoal UI palette and Android display name.
- Android `applicationId` is `zw.co.crisis.security`, preventing accidental overwrite of the Omega app; Kotlin namespace stays unchanged internally until migration.
- Default Android server URL is an intentionally unusable `https://crisis.invalid`, rather than Omega production.
- Patrol scheduling and checkpoint acceptance rule foundation in `src/lib/patrol/` with dedicated unit tests.

## Not yet implemented / not ready for deployment
- Device-bound guard PIN sessions, offline secure credential store and handover screens.
- QR scanner, signed printed credentials and checkpoint CRUD/UI.
- Backend patrol event persistence, APIs, Prisma migrations, scheduler push, offline reconciliation and dashboards.
- Android scheduling, on-device scanner, notification delivery and offline event queue integration.
- Release signing, deployment settings, and hardware integration tests.

## Database safety
Do not reuse Omega `sentinel` or `omega_v18_test`. Do not run any seed or migration until a separate Crisis database is provisioned and reviewed.

## Verification boundary
A static printed QR is copyable; QR-only scans are communication evidence, not physical presence proof. GPS provides independent evidence when accurate and available. Offline reports retain both client event time and later server receipt time, and untrusted timestamps must be validated.
