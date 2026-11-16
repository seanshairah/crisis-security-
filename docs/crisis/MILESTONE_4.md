# Crisis Security — Milestone 4: standalone visual preview

## Run on your Mac without npm, Prisma, Docker or a database

Extract the ZIP, open the `crisis-security` folder, and double-click `start-preview.command` (macOS may require right-click → Open). Alternatively, from the project root run:

```bash
python3 -m http.server 3004 --directory public
```

Open `http://localhost:3004/crisis-preview/` in your browser. If 3004 is occupied, replace it with 3005 in the terminal command and URL. Never use port 3000 or Omega's database for this preview.

## What can be tried

- Grey-camouflage control-room layout.
- Five configured warehouse checkpoints and downloadable printable **demo** QR signs.
- Local sample check-in scans: select a checkpoint or, in a Chromium version with the native BarcodeDetector API, allow camera access and scan one of the sample signs. Sample codes are deliberately prefixed `CRISIS-DEMO:` and are not usable for security verification.
- Generate an unpredictable 10–35-minute sample patrol prompt, prioritising unvisited high-priority checkpoints.
- Simulate switching between Guard A and B and see separate event attribution. This is **not authentication**.
- Toggle demo offline mode and record locally queued, **unverified** scan events. The demo's browser localStorage is just convenience storage, not a durable Android SQLite outbox.
- Review timeline and coverage; clear the local demo.

## Not yet implemented

No real QR scanning backend, authenticated individual guard PIN workflow, SMS/call integration, geofence validation, Android camera or background notifications, reliable offline event sync, real database writes, or production-ready Crisis APK. The interactive preview is purely for design review and trialing the user journey. The proper Android implementation must use secure persistent offline records, signed/revocable checkpoint tokens and guarded shift sessions.

## Safety

This milestone never connects to Omega or Crisis databases, performs no migrations, and does not modify any production service. `npm install` is not necessary to run the preview. Actual QR credentials are not the example tokens in this preview.
