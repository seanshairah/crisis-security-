# Gate Inventory verification — 22 November 2026

Implemented in the existing Crisis Security repository: clean centred login without the photograph or promotional panel; Gate Inventory arrival/departure forms and review in the Android app; supervisor review, approval permissions, corrections and delivery failures in the portal; inbound and outbound integration boundaries; additive PostgreSQL migration; durable Android ledger upgrade; automated verification job.

## Passed locally

- Portal: 192 automated tests, TypeScript check, ESLint without warnings, and production build.
- Android 1.12.0 / version code 18: 91 JVM tests, zero failures/errors, debug assembly. The final build includes the shared guard controls and corrected bottom-inset spacing.
- Fresh PostgreSQL database: migration deployment and 31 integration checks.
- Upgraded PostgreSQL database: previous migrations, existing client/site/guard/shift fixtures, additive gate migration and 32 integration checks. Existing relationships and records survived.
- Integration scenarios: multi-item arrival; external departure; matching and mismatching observations; rejection reason; supervisor decision; immutable final decision; correction; duplicate/concurrent requests; QR/manual lookup; tampered checkpoint code; cross-site denial; revoked device; offline attribution after handover; explicit discrepancy delivery; external outage; late and missing acknowledgements; concurrent retry without another stock effect in the local receiver.
- Real browser against the production build: clean login on desktop, mobile width and dark theme; actual test-account sign-in; supervisor approval; unchanged original after a correction; failed sync shown independently from gate approval; manual retry; no browser errors.
- Existing generated patrol API documentation check and strict Android string-reference check.
- Separate local Crisis database: backed up before migration, then migration applied. Local dashboard restarted on port 3139. No Omega live records were changed.

## Physical Pixel verification

The Pixel was updated in place without clearing its activation or data. Its SQLite patrol ledger upgraded from v2 to v3 and all five original patrol records were retained byte-for-byte.

USB Test Guard 2 signed in through the normal guard screen and recorded a labelled test arrival of 25 bags from Test Supplier. The local Crisis server route was disconnected before confirmation. The receipt was saved in the durable queue, survived a force-stop and restart, and remained visible offline. The server had no receipt before reconnection. After reconnection, exactly one receipt and one command history entry existed, attributed to the original guard/session/site/checkpoint. The device command was acknowledged as SENT with its original JSON unchanged. The gate decision remained REVIEW, with no outbound stock delivery before supervisor approval.

A sign-in regression was also fixed: periodic refresh could erase fields. The entered guard number survived a 12-second refresh check on the emulator. Unsubmitted sign-in fields are rebuilt when returning from background.

The final small navigation/form-layout build passed all Android checks. Its final install and control checks are pending the Pixel returning to USB. Inventory camera scanning and release-signed APK installation still require a device check. Movement/checkpoint QR lookup passed server tests; that is not a claim that camera scanning passed.

The existing patrol lifecycle/GPS/QR, guided setup/PIN, handover and security-boundary integration suites also passed in a separate disposable regression database.

## Release blockers

1. Obtain the unrelated inventory system's actual API documentation, staging URL, authentication, supplier/product identifiers, units, receipt/reference mapping, acknowledgement and correction semantics. Local integration tests are not live-system verification.
2. Finish installing and checking the final navigation polish, then verify inventory camera scanning and release-signed installation on the shared phone. Repeat patrol and emergency device smoke checks during staging.
3. Run the controlled staging scenario on both systems and reconcile stock effects. Confirm the site's approval policy.
4. Obtain approval before production cutover or a migration affecting live data. Build and distribute the release with the established Crisis signer and the intended HTTPS server configuration. No new production APK or production cutover is claimed here.

See [Gate Inventory guide and contract](GATE_INVENTORY.md) for configuration, operation, retries and rollback. The GitHub verification job was added; these are local results, not a claim that remote CI has run.
