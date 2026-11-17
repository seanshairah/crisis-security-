import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextPatrolDue,
  selectCheckpoint,
  validatePatrolPolicy,
} from "../src/lib/patrol/patrol-rules";
const checkpoints = [
  { id: "gate", priority: 1, minimumVisits: 1 },
  { id: "fence", priority: 2, minimumVisits: 1 },
  { id: "bay", priority: 1, minimumVisits: 1 },
];
const now = Date.UTC(2026, 10, 13, 18);
const policy = { minIntervalMinutes: 10, maxIntervalMinutes: 35, shiftEndMs: now + 8 * 3600000 };
test("online and offline planners share bounded unpredictable windows", () => {
  validatePatrolPolicy(policy, checkpoints);
  assert.equal(
    nextPatrolDue(now, policy, () => 0),
    now + 10 * 60000,
  );
  assert.equal(
    nextPatrolDue(now, policy, () => 0xffffffff),
    now + 35 * 60000,
  );
  assert.equal(
    nextPatrolDue(now + 7 * 3600000 + 50 * 60000, policy, () => 0),
    null,
  );
  assert.throws(
    () => validatePatrolPolicy({ ...policy, minIntervalMinutes: 40 }, checkpoints),
    /Invalid/,
  );
});
test("coverage selection prefers checkpoints not yet visited, without repeating an already covered point", () => {
  assert.equal(selectCheckpoint(checkpoints, [], now, () => 0).id, "fence");
  assert.equal(
    selectCheckpoint(
      checkpoints,
      [{ checkpointId: "fence", capturedAtMs: now - 5000, assignmentId: "a" }],
      now,
      () => 0,
    ).id,
    "gate",
  );
  assert.equal(
    selectCheckpoint(
      checkpoints,
      [
        { checkpointId: "fence", capturedAtMs: now - 5000, assignmentId: "a" },
        { checkpointId: "gate", capturedAtMs: now - 5000, assignmentId: "b" },
      ],
      now,
      () => 0,
    ).id,
    "bay",
  );
});
