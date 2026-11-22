import test from "node:test";
import assert from "node:assert/strict";
import { signGateBody, verifyGateSignature } from "../src/lib/gate/signing";
import { backoffSeconds } from "../src/lib/gate/delivery";
import { outboundConfig, maxAttempts, inboundSites } from "../src/lib/gate/config";

const secret = "s".repeat(40);
const body = JSON.stringify({ a: 1 });
const now = 1_800_000_000_000;
const ts = String(now / 1000);

test("a fresh, untouched request verifies", () => {
  assert.ok(verifyGateSignature(secret, signGateBody(secret, now / 1000, body), ts, body, now));
});
test("a changed body, wrong secret or missing header is refused", () => {
  const sig = signGateBody(secret, now / 1000, body);
  assert.ok(!verifyGateSignature(secret, sig, ts, body + " ", now));
  assert.ok(!verifyGateSignature("x".repeat(40), sig, ts, body, now));
  assert.ok(!verifyGateSignature(secret, null, ts, body, now));
  assert.ok(!verifyGateSignature(secret, sig, "abc", body, now));
});
test("a captured request cannot be replayed outside the window", () => {
  const sig = signGateBody(secret, now / 1000, body);
  assert.ok(!verifyGateSignature(secret, sig, ts, body, now + 301_000));
  assert.ok(!verifyGateSignature(secret, sig, ts, body, now - 301_000));
  assert.ok(verifyGateSignature(secret, sig, ts, body, now + 299_000));
});
test("backoff grows, caps at an hour and stays jittered", () => {
  assert.ok(backoffSeconds(1, 0.5) < backoffSeconds(4, 0.5));
  assert.ok(backoffSeconds(30, 1) <= 3600 * 1.2);
  assert.notEqual(backoffSeconds(5, 0), backoffSeconds(5, 1));
});
test("connection settings explain what is missing and never accept plain http", () => {
  const bad = outboundConfig({} as unknown as NodeJS.ProcessEnv);
  assert.ok(!bad.ok && bad.problems.length === 3);
  const http = outboundConfig({
    GATE_OUTBOUND_URL: "http://inventory.example.com/hook",
    GATE_OUTBOUND_TOKEN: "t".repeat(32),
    GATE_OUTBOUND_SIGNING_SECRET: secret,
  } as unknown as NodeJS.ProcessEnv);
  assert.ok(!http.ok && /HTTPS/.test(http.problems[0]));
  const ok = outboundConfig({
    GATE_OUTBOUND_URL: "https://inventory.example.com/hook",
    GATE_OUTBOUND_TOKEN: "t".repeat(32),
    GATE_OUTBOUND_SIGNING_SECRET: secret,
  } as unknown as NodeJS.ProcessEnv);
  assert.ok(ok.ok);
  assert.equal(maxAttempts({ GATE_MAX_ATTEMPTS: "1" } as unknown as NodeJS.ProcessEnv), 20);
  assert.deepEqual(
    inboundSites({ GATE_INBOUND_SITE_IDS: " a, b ,," } as unknown as NodeJS.ProcessEnv),
    ["a", "b"],
  );
});

test("the startup check names a half-configured inventory connection", async () => {
  const { checkEnv } = await import("../src/lib/env-check");
  const base = { NODE_ENV: "test", AUTH_SECRET: "a".repeat(40), DATABASE_URL: "postgres://x" };
  assert.equal(checkEnv(base).filter((i) => i.key.startsWith("GATE")).length, 0);
  const partial = checkEnv({ ...base, GATE_OUTBOUND_URL: "https://inventory.example.com/hook" });
  assert.ok(partial.some((i) => i.key === "GATE_OUTBOUND" && /TOKEN/.test(i.message)));
});
