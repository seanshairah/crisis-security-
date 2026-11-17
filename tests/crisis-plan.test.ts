import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatrolPlan } from "../src/lib/patrol/plan";
import { scanSchema, policySchema, checkpointSchema } from "../src/lib/patrol/validation";
const start = Date.UTC(2026, 10, 13, 18);
const checkpoints = [
  { id: "north", priority: 2, minimumVisits: 1 },
  { id: "south", priority: 1, minimumVisits: 1 },
];
test("offline issued plans have non-overlapping bounded windows and cover the route", () => {
  const plan = createPatrolPlan(
    start,
    start + 8 * 3600000,
    { minIntervalMinutes: 10, maxIntervalMinutes: 30, responseMinutes: 5 },
    checkpoints,
    () => 0,
  );
  assert.equal(plan[0].checkpointId, "north");
  assert.equal(plan[1].checkpointId, "south");
  for (let i = 0; i < plan.length; i++) {
    assert.ok(+plan[i].expiresAt > +plan[i].dueAt);
    assert.ok(+plan[i].expiresAt <= start + 8 * 3600000);
    assert.equal(+plan[i].dueAt - (i ? +plan[i - 1].expiresAt : start), 600000);
  }
});
test("randomness changes issued windows, no window begins beyond shift end", () => {
  const p = { minIntervalMinutes: 10, maxIntervalMinutes: 30, responseMinutes: 5 };
  const early = createPatrolPlan(start, start + 3600000, p, checkpoints, () => 0);
  const late = createPatrolPlan(start, start + 3600000, p, checkpoints, () => 0xffffffff);
  assert.notDeepEqual(early, late);
  assert.equal(+late[0].dueAt, start + 1800000);
  assert.deepEqual(
    createPatrolPlan(start, start + 600000, p, checkpoints, () => 0),
    [],
  );
});
test("API validation rejects missing evidence, invalid GPS and unsafe policy", () => {
  assert.equal(
    policySchema.safeParse({
      enabled: true,
      minIntervalMinutes: 50,
      maxIntervalMinutes: 10,
      responseMinutes: 5,
    }).success,
    false,
  );
  assert.equal(
    checkpointSchema.safeParse({
      name: "Gate",
      latitude: 91,
      longitude: 0,
      radiusM: 50,
      priority: 1,
      minimumVisits: 1,
    }).success,
    false,
  );
  assert.equal(scanSchema.safeParse({ eventId: "x" }).success, false);
});

import { gpsTimeCorrelates } from "../src/lib/patrol/scan-time";
test("QR capture may precede its fresh GPS fix, without accepting stale or future fixes", () => {
  const qr = new Date(start),
    received = new Date(start + 120000);
  assert.equal(gpsTimeCorrelates(qr, new Date(start + 60000), received), true);
  assert.equal(gpsTimeCorrelates(qr, new Date(start - 10001), received), false);
  assert.equal(gpsTimeCorrelates(qr, new Date(start + 90001), received), false);
  assert.equal(gpsTimeCorrelates(qr, new Date(start + 60000), new Date(start)), false);
});
