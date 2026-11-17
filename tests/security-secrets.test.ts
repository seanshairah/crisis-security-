import { test } from "node:test";
import assert from "node:assert/strict";
import { secretMatches } from "../src/lib/security/secrets";
import { SimulatedProvider } from "../src/lib/sms/providers/simulated";
test("secret authentication rejects missing, default and mismatched credentials", () => {
  for (const expected of [undefined, "", "change-me", "dev-secret-example"])
    assert.equal(secretMatches(expected, expected), false);
  assert.equal(secretMatches("private-test-secret", "private-test-secret"), true);
  assert.equal(secretMatches("private-test-secret", "wrong"), false);
});
test("simulated webhook requires a header and never accepts query credentials", async () => {
  const old = process.env.SMS_WEBHOOK_SECRET;
  try {
    const req = {
      headers: new Headers(),
      url: "https://example.invalid/webhook?key=private-test-secret",
      rawBody: "",
      contentType: "application/json",
    };
    delete process.env.SMS_WEBHOOK_SECRET;
    assert.equal(await new SimulatedProvider().verifyWebhook(req), false);
    process.env.SMS_WEBHOOK_SECRET = "private-test-secret";
    assert.equal(await new SimulatedProvider().verifyWebhook(req), false);
    req.headers.set("x-webhook-secret", "private-test-secret");
    assert.equal(await new SimulatedProvider().verifyWebhook(req), true);
  } finally {
    if (old === undefined) delete process.env.SMS_WEBHOOK_SECRET;
    else process.env.SMS_WEBHOOK_SECRET = old;
  }
});
