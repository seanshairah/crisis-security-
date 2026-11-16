# Crisis: admin quick start

Open **http://localhost:3139/setup** on this Mac and sign in with your existing Crisis admin account.

The local app connects to the separate `crisis_security` database on port 5433. Omega continues on port 3000. Messages are simulated during this local test. The local database was backed up before the patrol migration.

1. **Site & checkpoints:** Add the site and its client, choose the position on the map, then add a checkpoint. Download its QR sign before leaving the page. Turn on patrols and save the timing. For the USB test, choose **Short test · every 1–2 minutes**.
2. **Choose a guard:** Add a guard or choose an existing guard, then set their individual PIN. Give the guard their sign-in number and PIN privately.
3. **Connect the phone:** Name the company phone, enter its SIM number, then get an activation code. Install the supplied **1.11.0 local-test APK**, connect the USB data cable, and allow USB debugging. The APK has the local server address prefilled. Enter the activation code on the phone; the checklist updates when it connects.
4. **Schedule & start:** Schedule a shift covering the test time. Sign into Field operations on the phone with the guard number and PIN. Wait for the checkpoint prompt, scan the QR sign at its actual position, and check the result in the web Patrol command screen.

Use real site/checkpoint coordinates for a field test. A screenshot or copied QR code alone is not evidence that a guard was at the site; GPS must also pass. Grant the Android app precise location, camera and notification permissions when asked.

## USB test

The local app runs on this Mac. The debug APK connects through USB port forwarding while the cable is attached. Run `npm run local:usb` after Android authorizes the device; it does not install, uninstall or erase anything. No phone is claimed tested until it is actually connected and authorized.

Planned checks: activation → individual guard sign-in → randomized prompt → camera QR scan + GPS → dashboard result → duplicate sync → offline scan queue/reconnection → second guard handover. Keep the cable connected; a disconnected phone cannot reach this localhost server.

## Restarting

Double-click **Start Crisis.command** in the project folder, then open the address above. Keep its Terminal window open. Closing it or pressing Control-C stops Crisis only. If Crisis is already running on port 3139, use the existing instance.

Advanced checkpoint priorities, visit targets and custom timing are optional. New sign-in and handover need a server connection; an already-issued patrol session can continue offline. The debug APK is for testing, not a production release.

## Completed Pixel check

The real camera, offline queue, app-stop persistence, GPS correlation and server completion passed in the [Pixel USB test](PIXEL_USB_TEST.md). Physical handover and phone reboot remain pending.

Coordinate QR update: see [Coordinate patrols](COORDINATE_PATROLS.md). Existing signs show **Upgrade coordinate QR**; replace those paper signs and sync the phone before testing Android 1.10.0. A green result is server verified; amber means saved and awaiting confirmation.
