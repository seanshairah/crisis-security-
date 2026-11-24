# Release phone verification — 24 November 2026

## Source and handset

Fetched GitHub main at `afa1981` (PR #8). Its source tree matches `e5b8217`; local release consistency fixes were preserved in `b103aa0` and rebased onto current main. PR #5 was not changed or merged.

The connected, authorized Pixel 6 Pro runs `zw.co.crisis.security`, release 1.12.0 / code 18. It is not the local 1.13 candidate. Its signing certificate differs from the configured local release key, so no uninstall or incompatible update was attempted.

## Passed in this run

- 204 portal unit tests.
- 42 Gate integration checks on the disposable `crisis_gate_fresh` database: signing, acknowledgement/retry, duplicate protection, cancellation, correction ordering and recovery.
- Disposable PostgreSQL patrol, guided setup, security hardening and handover integration suites.
- Release assembly and 108 Android release JVM tests before the display fix; 110 after the fix. The rebuilt APK signature verifies.
- Physical release activation over a user-approved temporary HTTPS tunnel restricted to device APIs; the admin dashboard was excluded.
- First labelled test guard signed in with an individual session.
- Physical phone submitted an arrival of 25 bags. The UI acknowledged receipt separately from approval. Exactly one movement, one initial history entry and no premature external delivery were recorded.
- Real browser login and supervisor approval of that arrival queued exactly one delivery. No browser JavaScript errors occurred.
- With Wi-Fi and mobile data disabled, the phone saved a seven-bag departure, explicitly showing it as unapproved. No server movement existed during the outage.
- The departure survived force-stop/relaunch and remained queued in the UI. Original network connectivity was restored.
- Reconnection uploaded exactly one seven-bag departure in supervisor review. Repeated sync did not duplicate it.
- First guard signed out; second guard signed in. Server records retained the first guard/session attribution for both stock movements.

All phone fixtures were labelled local Crisis test records. Docker-hosted Omega records were not modified. Real inventory credentials were not configured; no live external stock update was attempted. The webhook receiver checks used an isolated test receiver.

## Defects found and fixed in source

The phone's saved receipt row retained its original REVIEW snapshot after the server approved the movement. A refreshed server-backed row simultaneously displayed APPROVED.

`GateTracks.forReceipt` now uses the latest matching server movement for an acknowledged receipt, while preserving the receipt snapshot when offline or absent from the response. A different movement cannot alter it, and a queued command never becomes approved from another record. Regression tests cover approval/delivery refresh, unrelated records, offline fallback and queued records.

The handover screen also retained its previous "Shift ended" message after the second guard signed in. Transient messages now clear when returning to that screen.

These fixes are verified by release JVM tests and assembly, **not on this handset**: the matching installed signing key is still needed for an in-place update.

## Remaining acceptance checks

- Install the fixed candidate using the installed release's matching key, then repeat the status-refresh check physically.
- Physical camera scan and successful scan notification. The existing test checkpoint is approximately 213 km from the handset; its unchanged sign cannot establish a correct-location positive scan here. A properly measured local test checkpoint or a visit to the configured checkpoint is required. No checkpoint coordinates were fabricated or verification thresholds relaxed.
- Real unrelated inventory-system contract mapping and acceptance test. Isolated receiver success does not verify the live system.

Private credentials, exact coordinates, APK signing material and device/database evidence remain in ignored local storage. This report contains no secrets.

## Cleanup

Both test guard sessions were ended after final sync. The temporary reviewer was disabled.
The Cloudflare tunnel and restricted proxy were stopped, and the two disposable test database
containers were stopped. The normal local dashboard remains available on port 3139 (HTTP 200).
The phone retains its installed release and test activation; its temporary test endpoint is now
closed, so normal use requires activation against the intended permanent HTTPS portal.
Labelled test history was retained for review. No production deployment or GitHub push was performed.
