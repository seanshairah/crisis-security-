import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/crisis_test")
  throw Error("Disposable verification database only");
async function main() {
  const { db } = await import("../../src/lib/db");
  const { rateLimit } = await import("../../src/lib/security/rate-limit");
  const { loginBlocked } = await import("../../src/lib/auth/throttle");
  const { clientIp, generateDeviceToken, hashToken } = await import("../../src/lib/gateway/auth");
  const tag = randomUUID();
  try {
    const key = `integration:${tag}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(key, 5, 60000)));
    assert.equal(results.filter((r) => r.ok).length, 5);
    assert.ok(results.filter((r) => !r.ok).every((r) => r.retryAfterSeconds > 0));
    const digest = createHash("sha256").update(key).digest("hex");
    assert.equal(
      (await db.securityRateBucket.findUniqueOrThrow({ where: { key: digest } })).count,
      6,
    );
    await db.securityRateBucket.update({
      where: { key: digest },
      data: { resetAt: new Date(Date.now() - 1) },
    });
    assert.equal((await rateLimit(key, 5, 60000)).ok, true);
    for (let i = 0; i < 10; i++)
      assert.equal((await loginBlocked(`${tag}-source-a`, "admin@test.invalid")).blocked, false);
    assert.equal((await loginBlocked(`${tag}-source-a`, "admin@test.invalid")).blocked, true);
    assert.equal((await loginBlocked(`${tag}-source-b`, "admin@test.invalid")).blocked, false);
    assert.equal((await loginBlocked(`${tag}-source-a`, "other@test.invalid")).blocked, false);
    // Unknown source (no trusted proxy): per-account budget only, so one stranger cannot lock everyone out.
    for (let i = 0; i < 30; i++)
      assert.equal((await loginBlocked(null, `${tag}-a@test.invalid`)).blocked, false);
    assert.equal((await loginBlocked(null, `${tag}-a@test.invalid`)).blocked, true);
    assert.equal(
      (await loginBlocked(null, `${tag}-b@test.invalid`)).blocked,
      false,
      "another account is unaffected",
    );
    assert.equal(
      (await loginBlocked(`${tag}-source-c`, `${tag}-a@test.invalid`)).blocked,
      false,
      "a trusted source is not caught by the unknown-source account budget",
    );
    for (const forged of ["203.0.113.1", "203.0.113.2"])
      assert.equal(
        clientIp({ headers: new Headers({ "x-forwarded-for": `${forged}, 198.51.100.1` }) }, 1),
        "198.51.100.1",
      );
    const { POST: sms } = await import("../../src/app/api/sms/webhook/[provider]/route");
    const oldProvider = process.env.SMS_PROVIDER,
      oldSecret = process.env.SMS_WEBHOOK_SECRET;
    const before = await db.smsMessage.count();
    try {
      process.env.SMS_PROVIDER = "sendai";
      assert.equal(
        (
          await sms(
            new Request("http://localhost/api/sms/webhook/simulated", {
              method: "POST",
              body: "from=0770000000&body=YES",
            }),
            { params: Promise.resolve({ provider: "simulated" }) },
          )
        ).status,
        404,
      );
      process.env.SMS_PROVIDER = "simulated";
      delete process.env.SMS_WEBHOOK_SECRET;
      assert.equal(
        (
          await sms(
            new Request("http://localhost/api/sms/webhook/simulated", {
              method: "POST",
              body: "from=0770000000&body=YES",
            }),
            { params: Promise.resolve({ provider: "simulated" }) },
          )
        ).status,
        401,
      );
      assert.equal(await db.smsMessage.count(), before);
    } finally {
      if (oldProvider === undefined) delete process.env.SMS_PROVIDER;
      else process.env.SMS_PROVIDER = oldProvider;
      if (oldSecret === undefined) delete process.env.SMS_WEBHOOK_SECRET;
      else process.env.SMS_WEBHOOK_SECRET = oldSecret;
    }
    const token = generateDeviceToken();
    await db.gatewayDevice.create({
      data: {
        deviceName: "Security batch verifier",
        phoneNumber: tag,
        mode: "GUARD",
        sharedCompanyDevice: true,
        activationStatus: "ACTIVE",
        status: "ONLINE",
        tokenHash: hashToken(token),
      },
    });
    const { POST: events } = await import("../../src/app/api/patrols/events/route");
    const scans = Array.from({ length: 25 }, () => ({
      eventId: randomUUID(),
      sessionId: "nonexistent",
      assignmentId: "nonexistent",
      qr: "test-not-a-real-checkpoint-credential",
      capturedAt: new Date().toISOString(),
      latitude: null,
      longitude: null,
      accuracyM: null,
      mock: false,
    }));
    const send = (events: unknown[]) =>
      new Request("http://localhost/api/patrols/events", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sentAt: new Date().toISOString(), events }),
      });
    assert.equal(
      (await events(send(scans))).status,
      400,
      "more than 20 events is refused outright, never silently truncated",
    );
    const response = await events(send(scans.slice(0, 20)));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.acks.length, 20);
    assert.ok(
      body.acks.every(
        (a: { status: string; error: string }) =>
          a.status === "rejected" && a.error === "Session not found",
      ),
    );
    console.log(
      "PASS: shared atomic limits and expiry, login isolation, forged proxy prefixes, inactive/unsigned SMS rejection, bounded batch receipts and safe domain errors.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
