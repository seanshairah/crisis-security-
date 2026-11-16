# Crisis Security — Milestone 3: Interactive patrol preview and evidence rules

## Implemented

- Authenticated portal route `/patrols` linked in Operations sidebar, with an explicitly labelled, **non-persistent development preview** of site checkpoint management.
- Five example checkpoints, visibility into simulated coverage, extra demo checkpoint creation, random 10–35-minute patrol assignments, guard A/B handover preview and simulated patrol event timeline.
- Demo mode distinguishes online/offline without claiming actual offline persistence or camera QR verification.
- Pure `calculateCoverage` domain function that never counts pending/rejected/future-dated scans as confirmed checkpoint coverage, with policy validation, coverage and staleness statuses.
- Focused coverage tests, in addition to milestone 2 patrol and shared-device tests.

## Remaining for functioning release

- Implement and migrate Crisis-only patrol schema when database provisioning is approved; use separate database, not Omega's `sentinel`.
- Add permission-controlled checkpoint CRUD, QR issuance/revocation and printing, authenticated guard PIN enrolment and session/handover API, and server-side idempotent offline event ingest.
- Integrate Android CameraX/ML Kit QR scanner, company-device PIN login, durable queue, local patrol planner/alarms, and device reboot/handover tests.
- Integrate portal against real records, source-tagged scan evidence, alerts and proper client reports.
- Run full Next.js/Android test suites and physical-device validation after dependencies and SDK are available.

## Safety boundaries

- No database migration, real SMS/call, production deployment, or live Android APK build was performed.
- The `/patrols` page is not an operational attendance or location system. The buttons simulate actions in component memory and never authenticate guards, verify QR signs, or upload events.
- Signed printed QR signs are copyable; future production scanner must use independent evidence quality labels and optional GPS/NFC safeguards.
