import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnv, simulatorEnabled } from "../src/lib/env-check";

const base = { DATABASE_URL: "postgresql://x", AUTH_SECRET: "a".repeat(40), CRON_SECRET: "s1".repeat(20), AUTOMATION_SECRET: "s2".repeat(20), SMS_PROVIDER: "sendai", SMS_WEBHOOK_SECRET: "whsec_real" };

test("production refuses a missing or default AUTH_SECRET; development only warns", () => {
  assert.equal(checkEnv({ ...base, NODE_ENV: "production" }).length, 0);
  const prod = checkEnv({ ...base, NODE_ENV: "production", AUTH_SECRET: "change-me-to-a-long-random-string-at-least-32-chars" });
  assert.equal(prod.find((i) => i.key === "AUTH_SECRET")?.level, "fatal");
  const dev = checkEnv({ ...base, NODE_ENV: "development", AUTH_SECRET: "" });
  assert.equal(dev.find((i) => i.key === "AUTH_SECRET")?.level, "warn");
  const short = checkEnv({ ...base, NODE_ENV: "production", AUTH_SECRET: "real-but-short-secret" });
  assert.equal(short.find((i) => i.key === "AUTH_SECRET")?.level, "fatal", "production authentication requires a full-length key");
});

test("example defaults and plain-http app URL are flagged in production", () => {
  const issues = checkEnv({ ...base, NODE_ENV: "production", CRON_SECRET: "change-me", SMS_WEBHOOK_SECRET: "change-me", NEXT_PUBLIC_APP_URL: "http://172.20.10.3:3000", SIMULATOR_ENABLED: "true" }).map((i) => i.key);
  for (const k of ["CRON_SECRET", "SMS_WEBHOOK_SECRET", "NEXT_PUBLIC_APP_URL", "SIMULATOR_ENABLED"]) assert.ok(issues.includes(k), k);
});

test("simulator: on in development, off in production unless SMS is simulated or explicitly enabled", () => {
  assert.equal(simulatorEnabled({ NODE_ENV: "development" }), true);
  assert.equal(simulatorEnabled({ NODE_ENV: "production", SMS_PROVIDER: "sendai" }), false);
  assert.equal(simulatorEnabled({ NODE_ENV: "production", SMS_PROVIDER: "simulated" }), true);
  assert.equal(simulatorEnabled({ NODE_ENV: "production", SMS_PROVIDER: "sendai", SIMULATOR_ENABLED: "true" }), true);
  assert.equal(simulatorEnabled({ NODE_ENV: "development", SIMULATOR_ENABLED: "false" }), false);
});
