import { test } from "node:test";
import assert from "node:assert/strict";
import { hashGuardPin, verifyGuardPin } from "../src/lib/patrol/shared-device";
test("guard PINs are salted, verified and reject bad input", async () => {
  const a = await hashGuardPin("746291");
  const b = await hashGuardPin("746291");
  assert.notEqual(a, b);
  assert.equal(await verifyGuardPin("746291", a), true);
  assert.equal(await verifyGuardPin("746292", a), false);
  assert.equal(await verifyGuardPin("abc", a), false);
  await assert.rejects(hashGuardPin("123"), /PIN/);
});
