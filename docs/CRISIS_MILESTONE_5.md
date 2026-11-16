# Crisis integrated patrol build

This source continues the local v4 tree found at `/Users/sean/crisis-security-v4/crisis-security`. Work was performed in an isolated workspace copy. No original `.env`, database credentials, keystore, build output, or live records were copied or changed.

## Implemented

- Persisted patrol policies and GPS-bounded QR checkpoints owned by existing Locations. Location detail and patrol command share the same setup UI. QR signs are generated locally, downloaded on creation, and only their SHA-256 hashes are stored.
- Existing shifts determine guard/site eligibility. Company GUARD handsets keep a device identity, while individual PIN-authenticated guard sessions determine the person and shift. Admin provisioning, audited handovers, salted scrypt PINs and database-backed guard/device lockout are included.
- Cryptographically randomized, pre-issued patrol windows remain usable offline and across reboot. Existing Android foreground service raises local prompts. Embedded camera scanning, fresh GPS capture, mock-location flags and a separate durable SQLite ledger feed the authenticated device endpoint. Missing acknowledgements preserve evidence; rejected evidence remains visible.
- Atomic, serializable scan reconciliation; event-content conflict detection; one completion per assignment; immutable capture/receive times; wrong QR/GPS/session/shift rejections; late-upload reconciliation. Existing shift activity and operations notifications carry patrol results. Attendance is not fabricated from a patrol scan.
- Shared-session context is attached to existing queued handset events. GPS/alert intake derives the guard from that original session; handovers do not reattribute old events. Location requests and cached monitoring config recognize the active shared-device session.
- Persisted command dashboard, analytics, site filters, device/PIN provisioning, evidence stream, site and shift links, and 30-day CSV reports. Charcoal/grey camo surfaces, a new Crisis shield and an independent Crisis login cookie distinguish the application.

## Running and deployment

Use a dedicated Crisis PostgreSQL database and separate secrets in `.env`; never point this checkout at Omega. Install with `npm ci`, then `npm run db:generate`. Review and apply migrations to the Crisis database with `npx prisma migrate deploy`. Start with `npm run dev` or build using `npm run build`.

1. Create/select the client and site with the existing location flow.
2. Open the site's detail page or Patrol command → site. Assign checkpoints, download each QR sign, and enable the patrol policy.
3. Create/activate an unlinked company Android device using the existing Devices flow; assign it to the site in Patrol command. Set individual guard PINs there.
4. Schedule guards using existing Shifts. Install the new debug APK for testing, activate it against the Crisis server, open Patrol command and sign in during the scheduled shift.
5. Scans and prompts continue offline within the issued session. Sync evidence after reconnection. Review exceptions in the evidence stream and operations notifications.

Policy updates apply to newly issued sessions. Existing issued windows are retained for audit. Archive a checkpoint rather than deleting its history. A lost QR sign can be replaced by archiving the point and creating its replacement; retain old signs only for already-issued sessions.

## Explicit limits

New sign-in, sign-out and guard handover require internet. Existing sessions and their random windows operate offline; offline PIN authentication/lease provisioning is not implemented. Patrol prompts depend on the existing foreground service running and Android notification permissions. GPS/device capture times are handset evidence, not tamper-proof hardware attestation; delayed uploads are marked. Minimum-visit targets influence planning but cannot guarantee completed coverage or physical guard movement.

The APK is a debug-signed test build with a configurable server at activation, not a production-signed release. A real Pixel USB test subsequently verified activation, camera QR decoding, offline capture, app-stop persistence and server reconciliation; see PIXEL_USB_TEST.md. A physical patrol walk, phone reboot, physical shared-phone handover and production deployment remain unverified.

The inherited preview files remain historical aids; `/patrols` is now the real database-backed application. Production release distribution remains gated by the existing release-signing checks.

## Verification evidence

See [verification results](../artifacts/verification/RESULTS.md), build/test logs and desktop/mobile screenshots under `artifacts/verification`. Tests used a disposable local PostgreSQL database; production signing and physical handset validation were not performed.
