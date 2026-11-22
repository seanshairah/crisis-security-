# Gate Inventory

> **Integration contract:** the authoritative, current contract (signed deliveries, status poll, cancel, retry and parking rules) is [`GATE_INTEGRATION.md`](GATE_INTEGRATION.md) with the machine-readable [`openapi/gate-integration.yaml`](openapi/gate-integration.yaml). The v1 section below is kept for history; where they differ, the integration guide wins.

Implemented in the existing Crisis portal and Android guard application. The external stock system has its own database. This feature does not connect to or migrate Omega.

## Using it

- Guards sign in for an existing active shift. Open **Patrol → Gate Inventory**. The site comes from that shift, not a field the guard can change.
- Choose **Record arrival**, **Record departure**, or **Review pending movements**. Select an active site checkpoint, enter the party and origin/destination, actual time, vehicle (when applicable), and one or more items with explicit quantities and units. Review and explicitly confirm.
- A checkpoint CS2 QR selects a valid checkpoint from the current site. A movement `GM1:<opaque movement ID>` QR retrieves a movement for review. Neither scan approves goods or certifies GPS presence. Use the reference or registration lookup when scanning fails. Gate QR handling does not alter the patrol GPS checks.
- Guard-created movements default to supervisor review. Admins can enable guard approval per site under **Gate Inventory → Site approval permissions**. A matching externally submitted movement may then be approved or rejected by a signed-in guard. Rejection requires a reason. Differences always require an explanation and supervisor review.
- Supervisors see only sites whose existing `Location.supervisorId` matches their account. Admins see all sites. Open a movement to compare the submitted and observed details, approve/reject, inspect history, view its QR, and retry failed deliveries. No approval is possible before an observed physical check exists.
- Final records cannot be edited. **Create audited correction** creates another reviewable movement linked to the original. Approval of that amendment produces a separate explicitly linked external event.

## Offline and attribution

Gate commands share the app's existing patrol SQLite database, upgraded additively from v2 to v3. The immutable command stores its UUID, guard session, checkpoint, physical movement time, and capture time. The existing worker/foreground sync sends up to 20 commands per cycle. Restarting or handing over the phone does not erase queued commands or reassign them to the next guard.

The guard sees **saved on phone**, **reached server**, or a specific error. Server gate approval and external delivery status are separate. The pending list also includes the current session's recent movements so the guard can inspect server approval/delivery status after refresh. Offline lists are cached per session; connect once to obtain site checkpoints. Sign-in requires a connection. Offline commands captured during their original valid session can arrive up to seven days later; they cannot be newly captured after that session ended. Deactivated guards/sites and revoked devices are rejected. Records arriving after handover, after session expiry, or more than 15 minutes after capture always require supervisor review even when guard approval is enabled. A permanent server rejection remains in the device ledger for review; it is not silently discarded or retried as a new movement.

## Integration contract v1

Configure secrets privately, separately from device tokens:

- `GATE_INBOUND_TOKEN`: at least 32 random characters.
- `GATE_INBOUND_SITE_IDS`: comma-separated Crisis location IDs this connection may submit to. Empty means no sites.
- `GATE_OUTBOUND_URL`: trusted HTTPS decision receiver, with no embedded credentials or redirects.
- `GATE_OUTBOUND_TOKEN`: at least 32 random characters, used as a bearer token.
- `GATE_ALLOW_LOCAL_TEST=true` permits plain HTTP **only to loopback** for isolated verification. Keep false for deployment.

### Submit expected goods

`POST /api/gate/inbound`, `Authorization: Bearer <GATE_INBOUND_TOKEN>`, JSON:

```json
{
  "reference": "DISPATCH-1001",
  "locationId": "CRISIS_LOCATION_ID",
  "direction": "DEPARTURE",
  "details": {
    "category": "MAIZE",
    "items": [{ "name": "Maize", "description": "Dry bags", "quantity": 25, "unit": "bags" }],
    "party": "Person taking goods",
    "place": "Destination",
    "occurredAt": "2026-11-22T10:00:00.000Z",
    "vehicleType": "TRUCK",
    "registration": "TEST123",
    "note": "Delivery note reference"
  }
}
```

Directions: `ARRIVAL`, `DEPARTURE`. Categories: `MAIZE`, `MACHINERY`, `OTHER` (requires an item description). Vehicles: `NONE`, `TRUCK`, `CAR`, `OTHER`; registration required for vehicles. Quantity must be positive, unit explicit. Up to 40 items. A repeated reference with the same details returns the same movement and its current status. Changed details on an existing reference return 409 rather than overwriting a physical check or decision. Authentication failure: 401; site outside configured scope: 403. Store the returned `id`; the QR contains only `GM1:<id>`.

### Receive final gate decision

Crisis posts to `GATE_OUTBOUND_URL` with bearer authentication and `Idempotency-Key: <deliveryId>`. Body:

```json
{
  "deliveryId": "OPAQUE_STABLE_DELIVERY_ID",
  "event": "gate.decision.v1",
  "movementId": "OPAQUE_MOVEMENT_ID",
  "reference": "external:DISPATCH-1001",
  "locationId": "CRISIS_LOCATION_ID",
  "direction": "DEPARTURE",
  "expected": {},
  "observed": {},
  "status": "APPROVED",
  "discrepancies": [],
  "reason": "Count checked",
  "guardId": "GUARD_ID",
  "shiftId": "SHIFT_ID",
  "checkpointId": "CHECKPOINT_ID",
  "decisionBy": "user:APPROVER_ID",
  "decisionAt": "2026-11-22T10:05:00.000Z",
  "version": 2,
  "correctionOf": null
}
```

`expected`/`observed` contain the full details object (or null), not empty objects as abbreviated above. `status` is `APPROVED` or `REJECTED`; review holds are not sent as stock clearance. Guard-origin references start `guard:`; amendments start `correction:` and identify the original movement with `correctionOf`.

**Receiver obligation:** atomically persist the delivery ID and its effect on stock. Apply each ID once. Do not add stock for rejections. Apply approved corrections as amendments to the referenced movement according to the receiving system's inventory rules. Acknowledge only after durable recording:

```json
{ "accepted": true, "deliveryId": "OPAQUE_STABLE_DELIVERY_ID" }
```

A 2xx response without this matching acknowledgement is not success. Timeout, lost acknowledgement and 5xx produce a visible failure and exponential retries (up to an hour between retries). Retries reuse the exact delivery ID and frozen payload. A database lease prevents overlapping workers from sending the same row concurrently under normal operation. A receiver must still deduplicate because a network timeout can occur after it applied the update.

Due decisions are dispatched through the existing shared scheduler, including its in-process, heartbeat and `/api/automation/tick` cron triggers. Each tick dispatches at most three deliveries to bound network time. An admin may also `POST /api/gate/dispatch`. Device sync never carries the external secret. Failed attempts have a separate log with safe failure descriptions, not raw responses or credentials.

## Local verification

`node --import tsx --test tests/*.test.ts`

`node --import tsx scripts/dev/gate-inventory-integration.ts` requires an explicitly supplied dedicated database URL on **127.0.0.1:55440**, database `crisis_gate_fresh` or `crisis_gate_upgrade`; it refuses other databases and never loads `.env.local`. It clears only gate fixture tables in that isolated database. It runs a real local HTTP receiver to simulate outage, missing acknowledgements and recovery. Never point this test at production.

Android: `./android/gradlew -p android :app:testDebugUnitTest :app:assembleDebug`. `GateRulesTest` covers structural JSON equality and real quantity/party/unit discrepancies.

## Release and rollback

1. Review the external system's actual endpoint, authentication, supplier/product identifiers, units, reference format, acknowledgement and amendment semantics. The generic local contract is implemented; **live compatibility is not yet verified**.
2. Obtain production-cutover approval. Back up the separate Crisis database and verify restore access. Confirm you are not targeting Omega.
3. Deploy migration `20261122090000_gate_inventory` with `prisma migrate deploy` to Crisis. It adds gate tables/enums and one location relation; existing operational records are not rewritten. Android v2→v3 adds one ledger table without deleting patrols.
4. Configure HTTPS, per-connection secrets and allowed sites. Keep guard approval disabled until the site explicitly chooses it. Enable the existing scheduler endpoint and monitor pending/failed gate deliveries and attempt history.
5. Stage one arrival, one external departure, mismatch, rejection, cross-site rejection, offline/restart and webhook-outage recovery. Verify both sides' records and stock totals. Physically test a signed APK on a representative shared device before deployment.
6. Distribute a release signed with the established Crisis release key and a new app version code only after checks pass. The debug verification APK is not the production release.

Rollback: stop gate dispatch first; do not delete queued decisions or acknowledged delivery IDs. Roll back portal/app code to the previous build while retaining the additive gate tables and Android ledger. Reconcile any stock effects with the other system before resuming. Do not drop the new tables as a routine rollback; back up and export them before any separately approved destructive removal.
