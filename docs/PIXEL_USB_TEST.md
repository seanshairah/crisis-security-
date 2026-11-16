# Pixel USB field test — 15 November 2026

The real Google Pixel 6 Pro connected through authorized ADB and USB forwarding to the local Crisis application. Test records were labelled **Pixel USB Test Site**, **Crisis Device Verification**, **USB Test Guard 1/2**, and **Pixel 6 Pro — USB test** in the separate `crisis_security` database. No Omega application or database records were modified.

## Observed passes

- The installed app activated against the actual local Crisis server and reported heartbeats.
- Guard 1 signed in using an individual guard number/PIN on the company handset.
- The real camera decoded the checkpoint QR displayed on the Mac. The full-size local sign worked after the small chat preview proved difficult to focus on.
- A scan was captured with Crisis unavailable to the phone after USB forwarding was removed. The handset showed one queued event.
- Force-stopping and reopening the app preserved the queued event in SQLite. No app data was cleared.
- After forwarding was restored, the actual queued event reached the server and was **ACCEPTED**. The assignment became **COMPLETED**, with exactly one event row.
- The QR capture was inside its issued window. Its non-mock location fix had **7.28 m reported accuracy**, approximately **29.14 m** from the configured checkpoint. The fix was captured **11.338 seconds after** the QR read.
- The independent attendance flow recorded **VERIFIED_LATE / MONITORING**, using real phone location evidence rather than counting the patrol scan as attendance.

These statements concern device-reported location and the configured accuracy/fence checks; they are not hardware location attestation or proof of a physical patrol walk.

## Problems found and corrected

1. The login refresh timer could rebuild the sign-in form while a guard was typing. It now refreshes only an active session, and the patrol screen respects system bars.
2. The scanner forced an awkward landscape flow. It now uses a portrait capture activity and closes when its issued QR window expires. Deadlines use the phone's local time.
3. Raw GPS/network acquisition missed better fixes from Android's fused provider. Modern Android now listens to fused, GPS and network providers, with the original accuracy limits retained.
4. An attendance expectation opened before shared-phone sign-in remained stuck in SMS_ONLY. An unsettled expectation now becomes eligible for fresh Android evidence once a valid guard session is available; no attendance is manufactured.
5. The old scan timestamp was recorded after GPS acquisition, so a QR read before the deadline could be rejected when GPS finished after it. QR capture and GPS capture now have separate persisted timestamps. The server checks the QR window and session, and requires the fix to be fresh and correlated with that scan. Migration `20261115190000_patrol_gps_capture_time` adds the nullable GPS timestamp; old event history remains unchanged.
6. Offline and review messages now use plain language. Upload receipt alone is never called verification.

Two early scans with 100 m accuracy stayed unverified. One earlier offline attempt uploaded as OUTSIDE_WINDOW under the old timing behaviour. Those records were retained, not rewritten to create a successful test.

## Automated validation of the corrected source

- 169 JavaScript tests passed.
- 65 Android JVM tests passed.
- TypeScript, lint and production build passed.
- PostgreSQL integration tests passed, including concurrent replay, shared-device attribution, the late handset eligibility transition and a QR read whose fresh fix finishes after the QR deadline.
- APK signature verified; package `zw.co.crisis.security.debug`, version `1.9.5-debug`, code 15. This remains a debug-signed local USB test build.

See `artifacts/verification/pixel-usb-test` for the sanitized result, app screenshot and logs. Raw coordinates, test PINs, activation secrets, QR payloads and database backups stay in ignored local storage.

## Remaining checks

Physical shared-phone handover, phone reboot and closed-app background notification delivery remain unverified. Server-side handover and replay have passed integration tests. Production signing/deployment was not performed.

After the interruption the Pixel was disconnected and Docker was not running. Resume by starting Docker Desktop, reconnecting/unlocking the Pixel and accepting USB debugging. Keep the existing app installed; do not clear its data. Restore USB forwarding with `npm run local:usb`, then start Crisis using `Start Crisis.command`. Expired test shifts require a new test shift; historical shifts and evidence should remain unchanged.
