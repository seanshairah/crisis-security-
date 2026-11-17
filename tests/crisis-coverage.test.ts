import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCoverage } from "../src/lib/patrol/coverage";
const now = Date.UTC(2026, 10, 13, 18);
const points = [
  { id: "gate", minimumVisits: 1, maxGapMinutes: 30 },
  { id: "rear", minimumVisits: 2 },
];
test("pending offline scans are review evidence, not confirmed visits", () => {
  const rows = calculateCoverage(
    points,
    [{ checkpointId: "gate", occurredAtMs: now - 1000, result: "PENDING" }],
    now,
  );
  assert.deepEqual(
    rows.map((r) => r.state),
    ["AWAITING_REVIEW", "BEHIND"],
  );
  assert.equal(rows[0].acceptedVisits, 0);
  assert.equal(rows[0].pendingVisits, 1);
});
test("confirmed scans satisfy visits but old checkpoints become stale", () => {
  const rows = calculateCoverage(
    points,
    [
      { checkpointId: "gate", occurredAtMs: now - 31 * 60000, result: "ACCEPTED" },
      { checkpointId: "rear", occurredAtMs: now - 10000, result: "ACCEPTED" },
      { checkpointId: "rear", occurredAtMs: now - 5000, result: "ACCEPTED" },
    ],
    now,
  );
  assert.equal(rows[0].state, "STALE");
  assert.equal(rows[1].state, "COVERED");
});
test("rejected and future-dated visits cannot satisfy coverage", () => {
  const rows = calculateCoverage(
    [{ id: "gate", minimumVisits: 1 }],
    [
      { checkpointId: "gate", occurredAtMs: now - 100, result: "REJECTED" },
      { checkpointId: "gate", occurredAtMs: now + 60000, result: "ACCEPTED" },
    ],
    now,
  );
  assert.equal(rows[0].state, "BEHIND");
  assert.equal(rows[0].acceptedVisits, 0);
});
test("invalid policy is blocked", () => {
  assert.throws(() => calculateCoverage([{ id: "gate", minimumVisits: -1 }], [], now));
  assert.throws(() =>
    calculateCoverage(
      [
        { id: "gate", minimumVisits: 1 },
        { id: "gate", minimumVisits: 1 },
      ],
      [],
      now,
    ),
  );
});
