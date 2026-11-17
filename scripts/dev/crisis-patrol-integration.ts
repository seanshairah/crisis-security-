/** Run only against a disposable loopback database, never an existing deployment. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCoordinateQr } from "../../src/lib/patrol/checkpoint-qr";
const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/crisis_test" ||
  url.port !== "55439"
)
  throw Error("Refusing to test outside the isolated crisis_test database on localhost:55439");
async function main() {
  const { db } = await import("../../src/lib/db");
  const {
    startPatrolSession,
    recordPatrolScan,
    setPatrolPin,
    qrHash,
    expirePatrols,
    endPatrolSession,
    patrolConfig,
  } = await import("../../src/lib/patrol/service");
  const { guardDeviceConfig } = await import("../../src/lib/gateway/service");
  const { eligibleDeviceForGuard, createLocationRequest } =
    await import("../../src/lib/gateway/location-requests");
  const { processGatewayEvents } = await import("../../src/lib/gateway/events");
  const { alertsForDevice } = await import("../../src/lib/gateway/alerts");
  const id = randomUUID();
  const now = new Date();
  try {
    const user = await db.user.create({
      data: {
        name: "Verification operator",
        email: `${id}@test.invalid`,
        passwordHash: "unused",
        role: "ADMIN",
      },
    });
    const client = await db.client.create({ data: { code: id, name: "Isolated client" } });
    const site = await db.location.create({
      data: {
        code: id,
        name: "Verification site",
        clientId: client.id,
        address: "Test",
        latitude: -17.8,
        longitude: 31,
        patrolPolicy: {
          create: {
            enabled: true,
            minIntervalMinutes: 1,
            maxIntervalMinutes: 1,
            responseMinutes: 1,
          },
        },
      },
    });
    const checkpointId = randomUUID();
    const qr = createCoordinateQr({
      id: checkpointId,
      locationId: site.id,
      latitude: -17.8,
      longitude: 31,
      radiusM: 50,
    });
    await db.patrolCheckpoint.create({
      data: {
        id: checkpointId,
        name: "North gate",
        locationId: site.id,
        qrHash: qrHash(qr),
        qrPayload: qr,
        qrVersion: 2,
        latitude: -17.8,
        longitude: 31,
        radiusM: 50,
      },
    });
    const guards = await Promise.all(
      [1, 2].map((n) =>
        db.guard.create({
          data: {
            guardNo: `${id}-${n}`,
            firstName: "Guard",
            lastName: String(n),
            phone: `${id}-${n}`,
            nationalId: `${id}-${n}`,
          },
        }),
      ),
    );
    const shifts = await Promise.all(
      guards.map((g) =>
        db.shift.create({
          data: {
            guardId: g.id,
            locationId: site.id,
            startAt: new Date(+now - 60000),
            endAt: new Date(+now + 3600000),
            durationMinutes: 61,
            status: "ON_DUTY",
          },
        }),
      ),
    );
    const device = await db.gatewayDevice.create({
      data: {
        deviceName: "Company handset",
        phoneNumber: id,
        locationId: site.id,
        sharedCompanyDevice: true,
        mode: "GUARD",
        status: "ONLINE",
        activationStatus: "ACTIVE",
      },
    });
    const other = await db.gatewayDevice.create({
      data: {
        deviceName: "Other handset",
        phoneNumber: `${id}-other`,
        locationId: site.id,
        sharedCompanyDevice: true,
        mode: "GUARD",
        status: "ONLINE",
        activationStatus: "ACTIVE",
      },
    });
    await Promise.all(guards.map((g) => setPatrolPin(g.id, "746291", user.id)));
    await db.attendanceCheckIn.create({
      data: {
        shiftId: shifts[0].id,
        guardId: guards[0].id,
        scheduledStartAt: shifts[0].startAt,
        source: "SMS_ONLY",
      },
    });
    const config = await startPatrolSession(device.id, guards[0].guardNo, "746291");
    const { ensureExpectation, checkInConfig } =
      await import("../../src/lib/attendance/check-in-service");
    const posted = await db.shift.findUniqueOrThrow({
      where: { id: shifts[0].id },
      include: {
        guard: true,
        location: true,
        attendance: true,
        attendanceCheckIn: true,
        supervisor: true,
      },
    });
    const expected = await ensureExpectation(posted, await checkInConfig());
    assert.equal(expected!.source, "NONE");
    assert.equal(expected!.gatewayDeviceId, device.id);
    assert.equal(expected!.status, "AWAITING");
    assert.equal(expected!.verifiedArrivalAt, null);
    assert.ok(config.session);
    const session = config.session!;
    assert.equal(session.guardId, guards[0].id);
    assert.equal(session.shiftId, shifts[0].id);
    assert.ok(session.assignments.length > 0);
    const resumed = await startPatrolSession(device.id, guards[0].guardNo, "746291");
    assert.equal(resumed.session!.id, session.id);
    // Look-ahead: the phone is only sent windows opening within the site's look-ahead; OFF sends them all.
    const full = session.assignments.length;
    await db.patrolPolicy.update({
      where: { locationId: site.id },
      data: { lookaheadMode: "CUSTOM", lookaheadMinutes: 5 },
    });
    const trimmed = (await patrolConfig(device.id)).session!.assignments;
    const horizon = Date.now() + 5 * 60_000 + 1000;
    assert.ok(
      trimmed.length > 0 && trimmed.length < full,
      `look-ahead trims the plan (${trimmed.length} of ${full})`,
    );
    assert.ok(
      trimmed.every((a) => +new Date(a.dueAt) <= horizon),
      "no window beyond the look-ahead reaches the phone",
    );
    await db.patrolPolicy.update({
      where: { locationId: site.id },
      data: { lookaheadMode: "OFF", lookaheadMinutes: null },
    });
    assert.equal(
      (await patrolConfig(device.id)).session!.assignments.length,
      full,
      "off sends the whole plan",
    );
    await db.patrolPolicy.update({
      where: { locationId: site.id },
      data: { lookaheadMode: "DEFAULT" },
    });
    assert.equal((await guardDeviceConfig(device)).guard?.id, guards[0].id);
    assert.equal((await eligibleDeviceForGuard(guards[0].id))?.id, device.id);
    const request = await createLocationRequest({
      guardId: guards[0].id,
      actor: { userId: user.id, name: user.name },
    });
    assert.equal(request.request.guardId, guards[0].id);
    const queuedAlert = {
      eventId: randomUUID(),
      eventType: "SHIFT_OK",
      timestamp: new Date().toISOString(),
      shiftId: shifts[0].id,
      patrolSessionId: session.id,
      message: "Queued before handover",
    };
    const a = session.assignments[0];
    const scan = {
      eventId: randomUUID(),
      sessionId: session.id,
      assignmentId: a.id,
      qr,
      capturedAt: new Date(a.dueAt).toISOString(),
      gpsCapturedAt: new Date(a.dueAt).toISOString(),
      latitude: -17.8,
      longitude: 31,
      accuracyM: 5,
      mock: false,
    };
    const serverTime = new Date(+new Date(a.expiresAt) + 1000);
    await expirePatrols(serverTime);
    const before = await db.patrolAssignment.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(before.status, "MISSED");
    const notifications = await db.notification.count({
      where: { shiftId: shifts[0].id, type: "PATROL_MISSED" },
    });
    await expirePatrols(serverTime);
    assert.equal(
      await db.notification.count({ where: { shiftId: shifts[0].id, type: "PATROL_MISSED" } }),
      notifications,
    );
    const results = await Promise.all([
      recordPatrolScan(device.id, scan, serverTime),
      recordPatrolScan(device.id, scan, serverTime),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["duplicate", "ok"]);
    assert.equal(results[0].decision, "ACCEPTED");
    assert.equal(
      await db.shiftCheckIn.count({
        where: { shiftId: shifts[0].id, note: { startsWith: "Patrol verified:" } },
      }),
      1,
    );
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id: `patrol-missed:${a.id}` } })).type,
      "PATROL_RECONCILED",
    );
    await assert.rejects(recordPatrolScan(other.id, scan, serverTime), /conflict/);
    await assert.rejects(
      recordPatrolScan(device.id, { ...scan, qr: "a".repeat(30) }, serverTime),
      /conflict/,
    );
    const replay = await recordPatrolScan(
      device.id,
      { ...scan, eventId: randomUUID() },
      serverTime,
    );
    assert.equal(replay.decision, "ALREADY_COMPLETED");
    const lateAssignment = session.assignments[2];
    const lateScan = {
      ...scan,
      eventId: randomUUID(),
      assignmentId: lateAssignment.id,
      capturedAt: new Date(lateAssignment.dueAt).toISOString(),
      gpsCapturedAt: new Date(lateAssignment.dueAt).toISOString(),
    };
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          lateScan,
          new Date(+new Date(lateAssignment.dueAt) + 600000),
        )
      ).decision,
      "DELAYED_REVIEW",
    );
    assert.equal(
      (await db.patrolAssignment.findUniqueOrThrow({ where: { id: lateAssignment.id } })).status,
      "PENDING",
    );
    const offsetAssignment = session.assignments[3];
    const actualAt = +new Date(offsetAssignment.dueAt);
    const rawAt = new Date(actualAt - 3600000).toISOString();
    const offsetResult = await recordPatrolScan(
      device.id,
      {
        ...scan,
        eventId: randomUUID(),
        assignmentId: offsetAssignment.id,
        capturedAt: rawAt,
        gpsCapturedAt: rawAt,
      },
      new Date(actualAt + 1000),
      { offsetMs: 3600000 },
    );
    assert.equal(offsetResult.decision, "ACCEPTED");
    const clockRow = await db.patrolEvent.findUniqueOrThrow({
      where: { eventId: offsetResult.eventId },
    });
    assert.equal(+clockRow.capturedAt, actualAt);
    assert.equal(clockRow.rawCapturedAt!.toISOString(), rawAt);
    const b = session.assignments[1];
    const bServerTime = new Date(+new Date(b.dueAt) + 1000);
    const base = {
      ...scan,
      assignmentId: b.id,
      capturedAt: new Date(b.dueAt).toISOString(),
      gpsCapturedAt: new Date(b.dueAt).toISOString(),
    };
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), qr: "x".repeat(30) },
          bServerTime,
        )
      ).decision,
      "WRONG_QR",
    );
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), latitude: 0 },
          bServerTime,
        )
      ).decision,
      "OUTSIDE_CHECKPOINT",
    );
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), accuracyM: 500 },
          bServerTime,
        )
      ).decision,
      "GPS_UNCERTAIN",
    );
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), mock: true },
          bServerTime,
        )
      ).decision,
      "MOCK_LOCATION",
    );
    // Fresh GPS time is mandatory for coordinate-bearing signs, including older APK clients.
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), gpsCapturedAt: undefined },
          bServerTime,
        )
      ).decision,
      "GPS_TIME_UNCERTAIN",
    );
    const altered = qr.replace("-17.800000", "-16.800000");
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), qr: altered },
          bServerTime,
        )
      ).decision,
      "WRONG_QR",
    );
    // Even if a stored hash were replaced with an edited payload, the server rejects its HMAC.
    await db.patrolCheckpoint.update({
      where: { id: checkpointId },
      data: { qrHash: qrHash(altered) },
    });
    assert.equal(
      (
        await recordPatrolScan(
          device.id,
          { ...base, eventId: randomUUID(), qr: altered },
          bServerTime,
        )
      ).decision,
      "INVALID_QR_COORDINATES",
    );
    await db.patrolCheckpoint.update({ where: { id: checkpointId }, data: { qrHash: qrHash(qr) } });
    // A QR read before the deadline remains in-window while a fresh GPS acquisition finishes.
    const qrAt = new Date(+new Date(b.expiresAt) - 1000);
    const timed = await recordPatrolScan(
      device.id,
      {
        ...base,
        eventId: randomUUID(),
        capturedAt: qrAt.toISOString(),
        gpsCapturedAt: new Date(+qrAt + 60000).toISOString(),
      },
      new Date(+qrAt + 60001),
    );
    assert.equal(timed.decision, "ACCEPTED");
    const recordedTimes = await db.patrolEvent.findUniqueOrThrow({
      where: { eventId: timed.eventId },
    });
    assert.equal(+recordedTimes.capturedAt, +qrAt);
    assert.equal(+recordedTimes.gpsCapturedAt!, +qrAt + 60000);
    const incoming = await startPatrolSession(device.id, guards[1].guardNo, "746291");
    assert.equal(incoming.session!.guardId, guards[1].id);
    const alertAck = await processGatewayEvents(device, [queuedAlert]);
    assert.equal(alertAck[0].status, "ok");
    assert.equal(
      (await db.guardAlert.findUniqueOrThrow({ where: { eventId: queuedAlert.eventId } })).guardId,
      guards[0].id,
    );
    assert.ok((await alertsForDevice(device)).some((a) => a.eventId === queuedAlert.eventId));
    assert.equal(
      (await db.deviceLocationRequest.findUniqueOrThrow({ where: { id: request.request.id } }))
        .status,
      "CANCELLED",
    );
    assert.equal((await eligibleDeviceForGuard(guards[1].id))?.id, device.id);
    assert.equal(await eligibleDeviceForGuard(guards[0].id), null);
    const outgoing = await db.patrolSession.findUniqueOrThrow({ where: { id: session.id } });
    assert.ok(outgoing.endedAt);
    assert.equal(
      (await recordPatrolScan(device.id, { ...base, eventId: randomUUID() }, bServerTime)).decision,
      "SESSION_CLOSED",
    );
    const c = incoming.session!.assignments[0];
    const cancelled = {
      ...scan,
      eventId: randomUUID(),
      sessionId: incoming.session!.id,
      assignmentId: c.id,
      capturedAt: new Date(c.dueAt).toISOString(),
    };
    await db.shift.update({ where: { id: shifts[1].id }, data: { status: "CANCELLED" } });
    assert.equal(
      (await recordPatrolScan(device.id, cancelled, serverTime)).decision,
      "SHIFT_UNAVAILABLE",
    );
    await endPatrolSession(device.id, incoming.session!.id);
    // Five bad PINs persist the lockout even between independent request transactions.
    for (let i = 0; i < 5; i++)
      await assert.rejects(startPatrolSession(other.id, guards[0].guardNo, "999999"), /Invalid/);
    await assert.rejects(startPatrolSession(other.id, guards[0].guardNo, "746291"), /locked/);
    // The same guard can still use another company device; a different guard on this device isn't locked out.
    await assert.rejects(startPatrolSession(device.id, guards[0].guardNo, "999999"), /Invalid/);
    await assert.rejects(startPatrolSession(other.id, guards[1].guardNo, "999999"), /Invalid/);
    // Session sign-in does not manufacture attendance.
    assert.equal(
      await db.attendance.count({ where: { shiftId: { in: shifts.map((s) => s.id) } } }),
      0,
    );
    console.log(
      "PASS: isolated PostgreSQL patrol lifecycle, replay/concurrency, offline evidence, handover, GPS/QR rejection, cancellation, lockout and notification idempotency",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
