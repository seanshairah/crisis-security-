# Production readiness

The current release candidate is **1.13.0 (version code 19)**.

Use [GO_LIVE.md](GO_LIVE.md) for the current deployment checklist and
[GATE_INTEGRATION.md](GATE_INTEGRATION.md) for the inventory contract.
The previous October assessment described version 1.6 and is historical:
[October assessment](archive/PRODUCTION_READINESS_2026_10_19.md).

## Local checks for this candidate (2026-11-22)

- Portal: 204 unit tests passed; TypeScript, lint and production build passed after regenerating the Prisma client.
- Updated local dashboard restarted on port 3139; login returned HTTP 200 with the sign-in form.
- Android: 108 JVM tests passed, debug assembly passed, APK signature verified; metadata is 1.13.0-debug / code 19.
- Existing signing configuration was preserved; the keystore helper refused to overwrite it.
- The separate local `crisis_security` database was backed up before its pending Gate integration migration; migration deployment passed.
- These checks do not verify a physical phone or the unrelated inventory system.

## Physical release test follow-up (2026-11-24)

See [release phone verification](verification/RELEASE_PHONE_E2E_2026_11_24.md).
Online capture, supervisor approval, offline restart/replay and two-guard handover passed on
the installed 1.12 release. A stale receipt-status display was fixed in the 1.13 candidate;
110 release JVM tests pass. Its physical update remains blocked by the signing-key mismatch.

## Verification boundaries

Gate Inventory now includes signed outbound deliveries, optional inbound signatures,
site-scoped inbound requests, retries and operator recovery, cancellation, and a staged
Android form. These implemented features do not establish production readiness by themselves.

The earlier local 1.12 device results in [Gate verification](GATE_INVENTORY_VERIFICATION.md)
do not verify the redesigned 1.13 build. Before distribution, verify the new signed APK on
a phone, including online/offline arrival and departure, restart recovery, QR scanning,
shared-device handover and in-place updates with the existing signing certificate.

The external inventory system still needs a real contract mapping and an end-to-end
acceptance test. Confirm the Crisis database target, migration status, scheduler,
backup restore, production environment and signed connectivity test before deployment.
Do not use the Omega database or modify its records.
