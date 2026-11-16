import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueue } from "../src/lib/dashboard/queue";

const now = new Date("2026-11-16T20:00:00Z");
const g = (f: string, l: string) => ({ firstName: f, lastName: l, phone: "+263771000000" });
const alert = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  status: "OPEN",
  message: null,
  occurredAt: new Date(+now - 2 * 60000),
  guard: g("Farai", "Ncube"),
  location: { name: "Mbare Yard" },
  acknowledgedBy: null,
  ...extra,
});
const shift = (id: string, status: string, guard = g("Tendai", "Moyo")) => ({
  id,
  status,
  startAt: new Date("2026-11-16T18:00:00Z"),
  endAt: new Date("2026-11-17T06:00:00Z"),
  guard,
  location: { name: "Avondale" },
  attendance: null,
});

test("an unacknowledged emergency outranks everything and says nobody has it", () => {
  const q = buildQueue({
    now,
    alerts: [alert("a1", "RUNNING_LATE"), alert("a2", "EMERGENCY")],
    shifts: [shift("s1", "NOT_CONFIRMED")],
    devices: [],
  });
  assert.equal(q[0].id, "alert:a2");
  assert.equal(q[0].owner?.label, "Nobody has acknowledged it");
  assert.equal(q[0].tone, "critical");
});

test("an acknowledged alert shows who is handling it and sinks below unowned work", () => {
  const q = buildQueue({
    now,
    alerts: [
      alert("a1", "EMERGENCY", { status: "ACKNOWLEDGED", acknowledgedBy: { name: "Rumbi" } }),
    ],
    shifts: [shift("s1", "NOT_CONFIRMED")],
    devices: [],
  });
  assert.equal(q[0].id, "shift:s1");
  assert.equal(q[1].owner?.label, "Handling: Rumbi");
});

test("informational alerts never reach the queue, and an alerted guard is not listed twice", () => {
  const q = buildQueue({
    now,
    alerts: [alert("a1", "SHIFT_OK"), alert("a2", "EMERGENCY")],
    shifts: [shift("s1", "CRITICAL", g("Farai", "Ncube"))],
    devices: [],
  });
  assert.deepEqual(
    q.map((i) => i.id),
    ["alert:a2"],
  );
});

test("offline phones queue last, and the list is capped", () => {
  const devices = [
    { id: "d1", deviceName: "Gate phone", lastSeenAt: new Date(+now - 14 * 60000), queued: 3 },
  ];
  const q = buildQueue({ now, alerts: [], shifts: [shift("s1", "LATE")], devices, limit: 5 });
  assert.equal(q.at(-1)?.kind, "device");
  assert.match(q.at(-1)!.detail, /14 min ago · 3 events saved/);
  const many = buildQueue({
    now,
    alerts: Array.from({ length: 9 }, (_, i) => alert(`x${i}`, "EMERGENCY")),
    shifts: [],
    devices: [],
  });
  assert.equal(many.length, 6);
});

test("a phone that has never connected is a setup task, not an urgent row", () => {
  const q = buildQueue({
    now,
    alerts: [],
    shifts: [],
    devices: [{ id: "d9", deviceName: "New phone", lastSeenAt: null }],
  });
  assert.equal(q.length, 0);
});
