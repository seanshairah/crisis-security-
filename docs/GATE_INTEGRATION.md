# Gate Inventory integration guide

For the team running the **inventory system** that receives gate decisions from Crisis Security.
Machine-readable contract: [`docs/openapi/gate-integration.yaml`](openapi/gate-integration.yaml).
A working receiver you can copy: [`scripts/gate-receiver.mjs`](../scripts/gate-receiver.mjs).

## How it fits together

```
Inventory system ──(1) expected movement──▶ Portal ──▶ Guard app (physical check at the gate)
Inventory system ◀─(2) signed decision ───── Portal ◀── Guard app / supervisor decision
Inventory system ──(3) poll / withdraw ───▶ Portal
```

1. **Announce (optional).** `POST /api/gate/inbound` with your own stable `reference`. The guard
   finds it by code, reference or vehicle registration and checks the goods against it. Records the
   guard creates without notice are delivered too (`expected: null`).
2. **Decide.** A matching check can be cleared by the guard where the site policy allows it; every
   difference, late/offline record or REVIEW goes to a supervisor. Nothing is sent to you until it is
   `APPROVED` or `REJECTED`.
3. **Deliver.** The portal POSTs one signed `gate.decision.v1` event per decision to your webhook.
   Gate clearance and delivery to you are tracked separately, so an outage on your side never blocks
   the gate.
4. **Amend.** A supervisor can amend a cleared record. The amendment is a _new_ event with
   `correctionOf` set; it is never delivered before the decision it amends.

## Credentials (agree these once, out of band)

| Setting (portal env)           | Direction    | Purpose                                             |
| ------------------------------ | ------------ | --------------------------------------------------- |
| `GATE_OUTBOUND_URL`            | portal → you | Your HTTPS webhook URL                              |
| `GATE_OUTBOUND_TOKEN`          | portal → you | Sent as `Authorization: Bearer …`                   |
| `GATE_OUTBOUND_SIGNING_SECRET` | portal → you | HMAC key you verify signatures with                 |
| `GATE_INBOUND_TOKEN`           | you → portal | Bearer token for the calls below                    |
| `GATE_INBOUND_SIGNING_SECRET`  | you → portal | Optional; if set, sign your requests the same way   |
| `GATE_INBOUND_SITE_IDS`        | you → portal | Comma-separated portal site ids you may use         |
| `GATE_MAX_ATTEMPTS`            | portal       | Attempts before an operator is alerted (default 20) |

All secrets are 32+ characters. Generate with `node scripts/generate-secrets.mjs` or
`openssl rand -hex 32`. Rotate by agreeing a new value and updating both sides.

## Receiving a decision (portal → you)

Headers: `authorization`, `content-type: application/json`, `idempotency-key` and
`x-crisis-delivery` (both = `deliveryId`), `x-crisis-event`, `x-crisis-timestamp`,
`x-crisis-signature`, `x-request-id`. Body: see `DecisionEvent` in the OpenAPI file.

**Verify the signature over the raw bytes**, before parsing:

```js
// Node
import { createHmac, timingSafeEqual } from "node:crypto";
function verify(headers, rawBody, secret) {
  const ts = headers["x-crisis-timestamp"];
  if (!/^\d{9,12}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const want = "v1=" + createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const got = headers["x-crisis-signature"] ?? "";
  return want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}
```

```python
# Python
import hmac, hashlib, time
def verify(headers, raw_body: bytes, secret: str) -> bool:
    ts = headers.get("x-crisis-timestamp", "")
    if not ts.isdigit() or abs(time.time() - int(ts)) > 300:
        return False
    want = "v1=" + hmac.new(secret.encode(), ts.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, headers.get("x-crisis-signature", ""))
```

**Then:** look up `deliveryId`. If you have it, answer `200 {"accepted":true,"deliveryId":"…"}` and
change nothing. If not, apply the stock change and store the `deliveryId` **in the same
transaction**, then answer. Never acknowledge before the change is stored.

Rules for applying it:

- Only `status: "APPROVED"` moves stock. `REJECTED` should be recorded, not applied.
- `observed` is the physically checked truth; `expected` is what you announced. `discrepancies`
  lists the fields that differ.
- When `correctionOf` is set, reverse the effect of the earlier decision for that movement and apply
  this one. Use `version` to order decisions for one `movementId`.
- Use `externalReference` (your reference) to find your own record. `movementId` is the portal's id.

### What the portal does with your answer

| You answer                                                       | Portal does                                         |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `2xx` with `{accepted:true, deliveryId}` matching                | Marks delivered                                     |
| `2xx` without a matching acknowledgement                         | Treats as not delivered, retries                    |
| `5xx`, timeout, network error, `401/403/404/408/409/423/425/429` | Retries with backoff (15 s doubling, capped at 1 h) |
| Other `4xx`, or `{accepted:false, retryable:false}`              | Parks it immediately and alerts an operator         |
| Still failing after `GATE_MAX_ATTEMPTS`                          | Parks it and alerts an operator                     |

Answer within **10 seconds**. Do slow work after acknowledging. A `gate.ping.v1` event is a
connectivity test: acknowledge it, change nothing. Redirects are not followed.

## Calling the portal (you → portal)

All calls need `Authorization: Bearer GATE_INBOUND_TOKEN` and are limited to your allowed sites.

- `POST /api/gate/inbound` — announce a movement. Same `reference` + same details = safe repeat.
  Same `reference` + different details = `409`. Unknown/inactive site = `404`; site not allowed = `403`.
- `GET /api/gate/inbound/{reference}` — current gate status and delivery progress. Use this to
  reconcile if you suspect a missed event. It never exposes guard, session or device identifiers.
- `POST /api/gate/inbound/{reference}/cancel` — withdraw a record no guard has checked yet. Repeats are
  harmless; after a guard has checked it you get `409` and must raise it with a supervisor.

If you set `GATE_INBOUND_SIGNING_SECRET`, also send `x-crisis-timestamp` and `x-crisis-signature`
computed exactly as above over your request body.

## Try it locally in five minutes

```bash
export T=$(openssl rand -hex 32) S=$(openssl rand -hex 32)
GATE_RECEIVER_TOKEN=$T GATE_RECEIVER_SECRET=$S npm run gate:receiver -- 4010
# portal .env.local
#   GATE_OUTBOUND_URL=http://127.0.0.1:4010/  GATE_OUTBOUND_TOKEN=$T
#   GATE_OUTBOUND_SIGNING_SECRET=$S           GATE_ALLOW_LOCAL_TEST=true
```

Then open **Gate Inventory** as an admin and press **Send test**. The portal's own integration
suite (`npm run test:gate-integration`) exercises outage, lost acknowledgement, replay, ordering,
refusal and signature checks against a local receiver.

## Go-live checklist

- [ ] Webhook is HTTPS with a valid certificate; answers within 10 s
- [ ] Signature, timestamp window and bearer verified; `deliveryId` stored transactionally
- [ ] Duplicate deliveries acknowledged without a second stock change
- [ ] Corrections reverse the earlier decision
- [ ] Both secrets stored in a secrets manager, not in source
- [ ] **Send test** succeeds from the production portal; one real arrival and departure walked through
- [ ] Someone on your side is told when the portal shows _Needs attention_
