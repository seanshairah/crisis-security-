import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsSchema, differences, gateDecision, canonical } from "../src/lib/gate/contract";
const d = {
  category: "MAIZE",
  items: [{ name: "Maize", description: "", quantity: 25, unit: "bags" }],
  party: "Test supplier",
  place: "Test farm",
  occurredAt: "2026-11-22T10:00:00.000Z",
  vehicleType: "TRUCK",
  registration: "TEST123",
  note: "",
};
test("gate forms require meaningful quantities, units and vehicle registration", () => {
  assert.equal(detailsSchema.safeParse(d).success, true);
  for (const quantity of [0, -1, Infinity])
    assert.equal(
      detailsSchema.safeParse({ ...d, items: [{ ...d.items[0], quantity }] }).success,
      false,
    );
  assert.equal(detailsSchema.safeParse({ ...d, registration: "" }).success, false);
  assert.equal(
    detailsSchema.safeParse({ ...d, vehicleType: "NONE", registration: "" }).success,
    true,
  );
  assert.equal(detailsSchema.safeParse({ ...d, category: "OTHER" }).success, false);
});
test("changes to physical goods and destination require explanation and supervisor review", () => {
  const expected = detailsSchema.parse(d),
    observed = detailsSchema.parse({
      ...d,
      items: [{ ...d.items[0], quantity: 20 }],
      place: "Different site",
    });
  assert.deepEqual(differences(expected, observed), ["items", "place"]);
  assert.throws(() => gateDecision("APPROVE", true, true, ""));
  assert.equal(gateDecision("APPROVE", true, true, "Five bags missing"), "REVIEW");
  assert.equal(gateDecision("APPROVE", false, false, ""), "REVIEW");
  assert.equal(gateDecision("APPROVE", false, true, ""), "APPROVED");
  assert.throws(() => gateDecision("REJECT", false, true, ""));
  assert.equal(gateDecision("REJECT", false, true, "Vehicle not authorised"), "REJECTED");
});
test("database JSON key order cannot break idempotency or cause false discrepancies", () => {
  assert.equal(canonical({ a: 1, b: [{ x: 2, y: 3 }] }), canonical({ b: [{ y: 3, x: 2 }], a: 1 }));
  const a = detailsSchema.parse(d);
  const reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.deepEqual(differences(a, detailsSchema.parse(reversed)), []);
});
