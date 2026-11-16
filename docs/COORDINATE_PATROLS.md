# Coordinate patrol update · Android 1.10.0 debug

The guard's home is now Field operations. It uses the Crisis charcoal/camouflage styling, a large scan action when a patrol is due, the latest scan result, recent scans, emergency/help and phone settings. Individual guard sign-in and the existing company-device activation and monitoring services are retained.

## What the guard sees

- **Green: Verified checkpoint.** The server accepted the checkpoint, location, time, guard session and assignment. Android posts a checkpoint confirmation notification with sound/vibration, subject to the phone's notification permission, channel settings and Do Not Disturb.
- **Amber: Saved offline · awaiting confirmation.** The phone saved the scan durably. A local coordinate match gives immediate haptic feedback, but is not called a verified patrol until the server accepts it.
- **Location/sign/time failure:** a specific instruction appears. A failed local GPS check does not block another attempt while offline. Failed evidence remains available for operations review.

Enable precise location and patrol notifications. A scan requires a fresh GPS fix. Poor accuracy, an uncertain boundary, mock location, a wrong sign and an expired patrol window do not complete a patrol.

## Admin setup and existing signs

Open **Setup → QR checkpoints & patrol timing**, or the site's patrol section. Place the map pin where the sign will be mounted and select the allowed radius. New checkpoints create coordinate signs automatically.

For an existing opaque sign, choose **Upgrade coordinate QR**, confirm, download and replace the mounted sign, then sync the company phone. The previous sign stops working. The new Android screen explicitly asks for an upgrade when it encounters an old sign. Previous patrol evidence is preserved. **Download QR sign** reprints an existing coordinate sign without changing its credential.

Only the labelled USB test checkpoint in the connected Crisis database was upgraded automatically for this test. Other existing signs require the admin's explicit upgrade action.

## How location checks work

A compact `CS2` sign contains checkpoint ID, site ID, latitude/longitude to six decimal places, radius, a random revocation nonce and an HMAC-SHA256 signature. The server stores the issued payload and its SHA256 hash. Use a stable server-only `PATROL_QR_SIGNING_SECRET` of at least 32 random characters; when omitted, `AUTH_SECRET` is used. Changing this key invalidates printed coordinate signs. The signing key is never included in the APK or shift data.

Before a shift, the phone caches authenticated assignments with the exact issued QR hash and checkpoint coordinates. Offline it checks that hash, checkpoint/site identity and coordinates, then compares fresh phone GPS to the QR fence. The server independently verifies the signature, current issued hash, stored checkpoint coordinates, GPS capture time, accuracy, mock flag, guard session and randomized assignment window. It accepts only when the GPS accuracy circle fits entirely inside the fence, with accuracy no worse than 50 m. Android separately stores QR-read and GPS-fix times so acquisition after the QR read does not falsely move the scan out of its response window.

A photograph of a static QR is still possible. A copy retains the original signed coordinates and cannot pass a location check elsewhere using an honest GPS fix. This is not hardware GPS attestation or proof against a compromised handset. Boundary uncertainty is rejected rather than treated as a match.

## Persistence and migration

Prisma migration `20261116090000_coordinate_checkpoint_qr` adds nullable QR payload and version columns. Existing checkpoints default to legacy version 1. The connected Crisis database was backed up before the additive migration. No Omega application records or deployment configuration were changed.

Android SQLite schema 2 retains original event JSON and adds checkpoint names, local result, notification receipt and connection metadata. Historical accepted rows are marked as already notified during upgrade. New accepted receipts use a stable notification ID and `onlyAlertOnce`; permission-disabled receipts remain pending for notification. Updating the APK must use **install/update**, never uninstall or clear app data.

## Verification and remaining device check

Server unit tests, Android JVM tests, isolated PostgreSQL integration and the production web build are run for this update. The browser test covers coordinate QR creation, reprinting without credential rotation, legacy upgrade, guided setup and narrow-screen layout. Integration tests cover copied QR scans away from the checkpoint, tampered payloads, missing GPS timestamps, poor GPS, mock fixes, replay, late sync, handover and cancellation.

Physical Pixel testing from the prior 1.9.5 build remains historical evidence only. The 1.10.0 update needs a new physical camera/GPS/notification test; emulator or synthetic receipts must not be represented as a real patrol. The USB debug APK connects to the local Crisis server through `npm run local:usb` while the authorized phone is connected.
