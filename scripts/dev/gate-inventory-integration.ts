/** Only runs against its dedicated disposable local database. Never loads .env.local. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { db } from "../../src/lib/db";
import {
  receiveMovement,
  applyGuardCommand,
  supervisorDecision,
  portalSite,
  listForGuard,
  correctMovement,
} from "../../src/lib/gate/service";
import { detailsSchema } from "../../src/lib/gate/contract";
import { deliverGateDecisions } from "../../src/lib/gate/delivery";
import { POST as inbound } from "../../src/app/api/gate/inbound/route";
import { GET as deviceGet } from "../../src/app/api/gate/device/route";
import { createCoordinateQr } from "../../src/lib/patrol/checkpoint-qr";
const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55440" ||
  !["crisis_gate_fresh", "crisis_gate_upgrade"].includes(url.pathname.slice(1))
)
  throw Error("Use the disposable gate test databases on 127.0.0.1:55440");
const suffix = randomUUID();
let checks = 0;
const details = detailsSchema.parse({
  category: "MAIZE",
  items: [
    { name: "Maize", quantity: 25, unit: "bags" },
    { name: "Seed", quantity: 10, unit: "kg" },
  ],
  party: "Fixture supplier",
  place: "Fixture farm",
  occurredAt: new Date().toISOString(),
  vehicleType: "TRUCK",
  registration: "TEST123",
});
async function main() {
  await db.gateDeliveryAttempt.deleteMany();
  await db.gateDelivery.deleteMany();
  await db.gateHistory.deleteMany();
  await db.gateMovement.deleteMany();
  if (url.pathname.endsWith("upgrade"))
    assert.equal(
      (await db.client.findUniqueOrThrow({ where: { id: "gate-upgrade-sentinel" } })).name,
      "Existing record retained",
    );
  if (url.pathname.endsWith("upgrade")) {
    const prior = await db.shift.findUniqueOrThrow({
      where: { id: "gate-upgrade-shift" },
      include: { guard: true, location: true },
    });
    assert.equal(prior.guard.firstName, "Existing");
    assert.equal(prior.location.name, "Existing site");
    checks++;
  }
  const client = await db.client.create({
    data: { code: suffix, name: "Gate integration fixture" },
  });
  const owner = await db.user.create({
    data: {
      name: "Gate supervisor",
      email: `${suffix}@example.invalid`,
      passwordHash: "not-a-login",
      role: "SUPERVISOR",
    },
  });
  const site = await db.location.create({
    data: {
      code: suffix,
      name: "Fixture gate",
      address: "Test only",
      clientId: client.id,
      supervisorId: owner.id,
    },
  });
  const other = await db.location.create({
    data: {
      code: suffix + "-other",
      name: "Unassigned site",
      address: "Test only",
      clientId: client.id,
    },
  });
  const guard = await db.guard.create({
    data: {
      guardNo: suffix,
      firstName: "Fixture",
      lastName: "Guard",
      phone: suffix,
      nationalId: suffix,
    },
  });
  const shift = await db.shift.create({
    data: {
      guardId: guard.id,
      locationId: site.id,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
      durationMinutes: 120,
    },
  });
  const token = randomUUID();
  const device = await db.gatewayDevice.create({
    data: {
      deviceName: "Fixture shared phone",
      phoneNumber: suffix,
      activationStatus: "ACTIVE",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      mode: "GUARD",
    },
  });
  const session = await db.patrolSession.create({
    data: {
      deviceId: device.id,
      shiftId: shift.id,
      startedAt: shift.startAt,
      expiresAt: shift.endAt,
      policyVersion: 1,
    },
  });
  const checkpoint = await db.patrolCheckpoint.create({
    data: { locationId: site.id, name: "Gate", qrHash: suffix, latitude: -17, longitude: 31 },
  });
  const qr = createCoordinateQr(checkpoint);
  await db.patrolCheckpoint.update({ where: { id: checkpoint.id }, data: { qrPayload: qr } });
  const user = {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    role: owner.role,
    avatarUrl: null,
    title: null,
  };
  // All core requests go through the same service used by the authenticated normal routes.
  const base = {
    commandId: randomUUID(),
    sessionId: session.id,
    checkpointId: checkpoint.id,
    capturedAt: new Date().toISOString(),
  };
  const record = { ...base, action: "RECORD", direction: "ARRIVAL", details };
  const [a, b] = await Promise.all([
    applyGuardCommand(device.id, record),
    applyGuardCommand(device.id, record),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.status, "REVIEW");
  checks++;
  assert.equal(
    await db.gateMovement.count({ where: { sourceReference: `guard:${record.commandId}` } }),
    1,
  );
  checks++;
  await assert.rejects(
    () => applyGuardCommand(device.id, { ...record, details: { ...details, party: "changed" } }),
    /different details/,
  );
  checks++;
  await supervisorDecision(user, a.id, a.version, "APPROVED", "Count and supplier checked");
  await assert.rejects(
    () => supervisorDecision(user, a.id, a.version, "REJECTED", "Too late"),
    /already changed/,
  );
  checks++;
  const original = await db.gateMovement.findUniqueOrThrow({ where: { id: a.id } });
  const correction = await correctMovement(
    user,
    a.id,
    { ...details, items: [{ ...details.items[0], quantity: 24 }] },
    "One damaged bag removed",
  );
  assert.equal(correction.status, "REVIEW");
  assert.equal(
    (await db.gateMovement.findUniqueOrThrow({ where: { id: a.id } })).version,
    original.version,
  );
  checks++;
  await assert.rejects(() => portalSite(user, other.id), /not assigned/);
  checks++;
  const header = { authorization: `Bearer ${token}` };
  assert.equal(
    (
      await deviceGet(
        new Request(`http://localhost/api/gate/device?sessionId=${session.id}&q=GM1:${a.id}`, {
          headers: header,
        }),
      )
    ).status,
    200,
  );
  checks++;
  const scoped = await listForGuard(device.id, session.id, qr);
  assert.equal(scoped.checkpointId, checkpoint.id);
  checks++;
  await assert.rejects(
    () => listForGuard(device.id, session.id, qr.slice(0, -1) + "!"),
    /Invalid checkpoint/,
  );
  checks++;
  process.env.GATE_INBOUND_TOKEN = "test-inbound-token-with-more-than-32-characters";
  process.env.GATE_INBOUND_SITE_IDS = site.id;
  const inboundData = { reference: suffix, locationId: site.id, direction: "DEPARTURE", details };
  const request = (d: unknown, auth = true) =>
    new Request("http://localhost/api/gate/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${process.env.GATE_INBOUND_TOKEN}` } : {}),
      },
      body: JSON.stringify(d),
    });
  assert.equal((await inbound(request(inboundData, false))).status, 401);
  checks++;
  assert.equal((await inbound(request({ ...inboundData, locationId: other.id }))).status, 403);
  checks++;
  const [ir1, ir2] = await Promise.all([
    inbound(request(inboundData)),
    inbound(request(inboundData)),
  ]);
  assert.equal(ir1.status, 200);
  assert.equal(ir2.status, 200);
  const m = await ir1.json();
  assert.equal((await ir2.json()).id, m.id);
  checks++;
  assert.equal(
    (await inbound(request({ ...inboundData, details: { ...details, party: "Different" } })))
      .status,
    409,
  );
  checks++;
  await db.gatePolicy.create({ data: { locationId: site.id, guardCanApprove: true } });
  const matchExpected = await receiveMovement({ ...inboundData, reference: suffix + "-match" });
  const match = await applyGuardCommand(device.id, {
    ...base,
    commandId: randomUUID(),
    action: "VERIFY",
    movementId: matchExpected.id,
    version: 1,
    decision: "APPROVE",
    reason: "",
    details,
  });
  assert.equal(match.status, "APPROVED");
  checks++;
  const manual = await listForGuard(device.id, session.id, match.sourceReference);
  assert.ok(manual.items.some((item) => item.id === match.id));
  checks++;
  const plateLookup = await listForGuard(device.id, session.id, "TEST123");
  assert.ok(plateLookup.items.some((item) => item.id === match.id));
  checks++;
  const allowedArrival = await applyGuardCommand(device.id, { ...record, commandId: randomUUID() });
  assert.equal(allowedArrival.status, "APPROVED");
  checks++;
  const verify = {
    ...base,
    commandId: randomUUID(),
    action: "VERIFY",
    movementId: m.id,
    version: 1,
    decision: "APPROVE",
    reason: "One bag short",
    details: { ...details, items: [{ ...details.items[0], quantity: 24 }] },
  };
  const mismatch = await applyGuardCommand(device.id, verify);
  assert.equal(mismatch.status, "REVIEW");
  checks++;
  await supervisorDecision(
    user,
    mismatch.id,
    mismatch.version,
    "APPROVED",
    "Actual count of 24 accepted",
  );
  const mismatchDelivery = await db.gateDelivery.findFirstOrThrow({
    where: { movementId: mismatch.id },
  });
  assert.deepEqual((mismatchDelivery.payload as { discrepancies: string[] }).discrepancies, [
    "items",
  ]);
  checks++;
  const rejectExpected = await receiveMovement({ ...inboundData, reference: suffix + "-reject" });
  await assert.rejects(
    () =>
      applyGuardCommand(device.id, {
        ...verify,
        commandId: randomUUID(),
        movementId: rejectExpected.id,
        details,
        decision: "REJECT",
        reason: "",
      }),
    /Explain/,
  );
  checks++;
  const rejection = await applyGuardCommand(device.id, {
    ...verify,
    commandId: randomUUID(),
    movementId: rejectExpected.id,
    details,
    decision: "REJECT",
    reason: "Vehicle not cleared",
  });
  assert.equal(rejection.status, "REJECTED");
  checks++;
  const outside = await receiveMovement({
    ...inboundData,
    reference: suffix + "-outside",
    locationId: other.id,
  });
  await assert.rejects(
    () =>
      applyGuardCommand(device.id, { ...verify, commandId: randomUUID(), movementId: outside.id }),
    /not found at your site/,
  );
  checks++;
  // A record captured on the old shift can sync after handover, preserving its session and guard.
  const offline = {
    ...record,
    commandId: randomUUID(),
    capturedAt: new Date(Date.now() - 1000).toISOString(),
  };
  await db.patrolSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
  const late = await applyGuardCommand(device.id, offline);
  assert.equal(late.guardId, guard.id);
  assert.equal(late.sessionId, session.id);
  assert.equal(late.status, "REVIEW");
  checks++;
  await assert.rejects(
    () =>
      applyGuardCommand(device.id, {
        ...record,
        commandId: randomUUID(),
        capturedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    /active shift/,
  );
  checks++;
  await db.gatewayDevice.update({ where: { id: device.id }, data: { status: "REVOKED" } });
  assert.equal(
    (
      await deviceGet(
        new Request(`http://localhost/api/gate/device?sessionId=${session.id}`, {
          headers: header,
        }),
      )
    ).status,
    403,
  );
  checks++;
  // Local external system simulates outage, lost acknowledgement, then safe replay.
  let mode = "outage",
    updates = 0;
  const seen = new Set<string>();
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(req.headers["idempotency-key"], body.deliveryId);
    if (mode === "outage") {
      res.writeHead(503);
      res.end();
      return;
    }
    if (!seen.has(body.deliveryId)) {
      seen.add(body.deliveryId);
      updates++;
    }
    res.setHeader("content-type", "application/json");
    if (mode === "late-ack") {
      setTimeout(
        () => res.end(JSON.stringify({ deliveryId: body.deliveryId, accepted: true })),
        11000,
      ).unref();
      return;
    }
    res.end(
      JSON.stringify(
        mode === "lost-ack" ? { accepted: true } : { deliveryId: body.deliveryId, accepted: true },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  process.env.GATE_OUTBOUND_URL = `http://127.0.0.1:${address.port}`;
  process.env.GATE_OUTBOUND_TOKEN = "local-test-outbound-token-more-than-32-chars";
  process.env.GATE_ALLOW_LOCAL_TEST = "true";
  try {
    await deliverGateDecisions();
    assert.equal((await db.gateDelivery.count({ where: { status: "FAILED" } })) > 0, true);
    checks++;
    mode = "late-ack";
    await db.gateDelivery.updateMany({
      where: { status: "FAILED" },
      data: { nextAttemptAt: new Date(0) },
    });
    await deliverGateDecisions(1);
    assert.equal(await db.gateDelivery.count({ where: { status: "SENT" } }), 0);
    checks++;
    mode = "lost-ack";
    await db.gateDelivery.updateMany({
      where: { status: "FAILED" },
      data: { nextAttemptAt: new Date(0) },
    });
    await deliverGateDecisions();
    const applied = updates;
    assert.ok(applied > 0);
    assert.equal(await db.gateDelivery.count({ where: { status: "SENT" } }), 0);
    checks++;
    mode = "ok";
    await db.gateDelivery.updateMany({
      where: { status: "FAILED" },
      data: { nextAttemptAt: new Date(0) },
    });
    await Promise.all([deliverGateDecisions(), deliverGateDecisions()]);
    assert.equal(updates, applied);
    assert.equal(await db.gateDelivery.count({ where: { status: "FAILED" } }), 0);
    checks++;
    assert.equal(await db.gateDelivery.count({ where: { status: "SENT" } }), applied);
    assert.equal((await db.gateDeliveryAttempt.count({ where: { success: false } })) > 0, true);
    checks++;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
  assert.equal(
    (await db.gateMovement.findUniqueOrThrow({ where: { id: a.id } })).status,
    "APPROVED",
  );
  checks++;
  console.log(
    `PASS: ${checks} inventory integration checks (${url.pathname.slice(1)}). All fixtures are isolated.`,
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
