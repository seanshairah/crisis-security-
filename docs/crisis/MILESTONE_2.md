# Crisis Security — Milestone 2 (source foundation, not a deployable feature)

## Completed and verified

- Existing Crisis/Omega source preserved in a separate working copy.
- `src/lib/patrol/shared-device.ts` contains server-side, salted-scrypt PIN hashing/verification, a 5-failure/15-minute lockout _policy function_, device/guard/shift session validation, and handover semantics. It is not a login API and must not be exposed to the browser.
- `src/lib/patrol/checkpoint-qr.ts` contains HMAC-SHA256 signed printable QR credential payloads, explicit site/checkpoint validation and credential revocation checks. Signing secrets must remain server-side; static QR signs are still copyable.
- `src/lib/patrol/offline-plan.ts` contains crypto-random local assignment selection, prevents overwriting still-pending patrols, and classifies queued scans for reconciliation.
- Eight focused tests passed locally using Node's experimental TS stripping against a temporary copy, including the four inherited milestone-1 tests. The usual `npm test`, `npm run typecheck`, full Android test suite and database-backed E2E were not run in this environment.

## Essential next integrations (not complete)

1. Add additive Prisma models/migrations for CompanyDevice, GuardCredential (salted PIN hashes and revocation), DeviceGuardSession, Checkpoint, CheckpointQrCredential, PatrolPolicy, PatrolTask, PatrolScan, PatrolException. Use UUID or CUID IDs, uniqueness on `eventId` and `(credentialId,siteId)`, audit trails, and index by site/shift/guard/device. No migration may target Omega `sentinel`.
2. Implement authenticated server endpoints for guard PIN enrolment, online sign-in, offline roster provisioning, revocation, handover, signed QR issuance, QR rotation/revocation, assignment creation, and idempotent scan batch sync. Enforce roles and rate limits. Persist failed PIN attempts transactionally per account/device; never rely on an in-process counter.
3. Implement device-local guard selection, PIN authentication using a protected time-limited provisioned verifier, secure storage, expiry/revocation policy, and full session lock on shift handover. A device-scoped background queue must retain immutable event guard/session/shift identities across handovers. Protect local records with Android Keystore; do not store plaintext PINs.
4. Implement Android camera QR scanning (CameraX/ML Kit or comparable supported libraries) with manifest permission handling. Validate checkpoint claims online; for offline scans store provisional evidence and submit to the server later for signature/credential/shift validation. **Never embed the HMAC signing key into the APK.**
5. Persist locally generated patrol assignments _before_ posting reminders. Android's OS background restrictions may delay exact alarm delivery; use a justified foreground service and recovery on reboot, time change, process death and data restoration. Periodically resynchronise policies.
6. Build Patrol Management UI with checkpoint CRUD, signed printable site QR signs, patrol configurations, patrol timeline with evidence labels and exception review. Do not present QR alone as verified physical location; GPS evidence is separate.
7. Validate using a separate Crisis test database only after database setup is approved. Existing Omega/SMS/call/GPS regressions and hardware device testing remain mandatory.

## Security / product cautions

- **Static QR does not prove physical presence.** A guard can scan a photograph. Treat QR as checkpoint-credential evidence and flag suspicious rapid transitions; optional GPS can increase confidence. High-security sites should consider NFC or rotating credentials.
- **Offline authentication cannot check a live revocation.** Restrict its validity by approved roster and a bounded expiry, plus local retry limits and phone management controls.
- **Caller phone number is not a guard identity** on shared devices. Every scan must bind to `guardId`, `sessionId`, `shiftId`, `siteId`, and `deviceId`.
- Server timestamps are arrival timestamps; keep device-capture times distinct and assess clock skew / delayed upload.
- **No database was connected, migrated, created or seeded in this milestone.** No repository published, APK built, or production deployment performed.
