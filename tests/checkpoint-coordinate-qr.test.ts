import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoordinateQr, verifyCoordinateQr } from "../src/lib/patrol/checkpoint-qr";
import { classifyFix } from "../src/lib/geofence";
const secret = "test-only-coordinate-signing-key-at-least-32";
const checkpoint = {
  id: "checkpoint-1",
  locationId: "site-1",
  latitude: -26.20410324,
  longitude: 28.04730441,
  radiusM: 100,
};
test("coordinate QR includes authenticated position and checkpoint identity", () => {
  const raw = createCoordinateQr(checkpoint, secret);
  const decoded = verifyCoordinateQr(raw, checkpoint, secret)!;
  assert.equal(decoded.latitude, -26.204103);
  assert.equal(decoded.longitude, 28.047304);
  assert.equal(decoded.radiusM, 100);
  assert.equal(decoded.siteId, "site-1");
  assert.notEqual(raw, createCoordinateQr(checkpoint, secret));
});
test("tampered coordinates, radius, checkpoint, signature and different keys are rejected", () => {
  const raw = createCoordinateQr(checkpoint, secret);
  for (const [index, value] of [
    [1, "other"],
    [2, "other-site"],
    [3, "-25.204103"],
    [4, "29.047304"],
    [5, "500"],
    [6, "x".repeat(22)],
    [7, "x".repeat(43)],
  ] as const) {
    const parts = raw.split("|");
    parts[index] = value;
    assert.equal(verifyCoordinateQr(parts.join("|"), checkpoint, secret), null);
  }
  assert.equal(verifyCoordinateQr(raw, checkpoint, secret + "other"), null);
  assert.equal(verifyCoordinateQr(raw, { ...checkpoint, latitude: -25.2 }, secret), null);
  assert.equal(verifyCoordinateQr("crisis:checkpoint:legacy", checkpoint, secret), null);
});
test("a genuine copied sign retains original fence and fails at another location", () => {
  const decoded = verifyCoordinateQr(createCoordinateQr(checkpoint, secret), checkpoint, secret)!;
  assert.equal(
    classifyFix(
      { latitude: checkpoint.latitude, longitude: checkpoint.longitude, accuracyM: 5 },
      decoded,
      50,
    ).state,
    "INSIDE",
  );
  assert.equal(
    classifyFix({ latitude: -26.214103, longitude: 28.047304, accuracyM: 5 }, decoded, 50).state,
    "OUTSIDE",
  );
  assert.equal(
    classifyFix(
      { latitude: checkpoint.latitude, longitude: checkpoint.longitude, accuracyM: 100 },
      decoded,
      50,
    ).state,
    "UNKNOWN",
  );
});
test("sign generation rejects invalid positions, unsafe radius and short key", () => {
  for (const changes of [
    { latitude: NaN },
    { longitude: 181 },
    { latitude: 91 },
    { radiusM: 501 },
    { radiusM: 0 },
    { id: "bad|id" },
  ])
    assert.throws(() => createCoordinateQr({ ...checkpoint, ...changes }, secret));
  assert.throws(() => createCoordinateQr(checkpoint, "short"));
});
