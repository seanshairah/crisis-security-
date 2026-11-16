import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";
/** Atomic shared counters. Storage failure fails closed; raw IPs/account names are not stored. */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const digest = createHash("sha256").update(key).digest("hex");
  const rows = await db.$queryRaw<{ count: number; retry: number }[]>`
    INSERT INTO "SecurityRateBucket" ("key", "count", "resetAt")
    VALUES (${digest}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "SecurityRateBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1 ELSE LEAST("SecurityRateBucket"."count" + 1, ${limit + 1}) END,
      "resetAt" = CASE WHEN "SecurityRateBucket"."resetAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."resetAt" ELSE "SecurityRateBucket"."resetAt" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - CURRENT_TIMESTAMP)))::int AS retry`;
  if (randomInt(100) === 0)
    await db.$executeRaw`DELETE FROM "SecurityRateBucket" WHERE "key" IN (SELECT "key" FROM "SecurityRateBucket" WHERE "resetAt" < CURRENT_TIMESTAMP - INTERVAL '1 day' LIMIT 100)`;
  return {
    ok: rows[0].count <= limit,
    retryAfterSeconds: rows[0].count <= limit ? 0 : Math.max(1, rows[0].retry),
  };
}

/** Successful credential verification clears only that pair, never its source/device budget. */
export async function clearRateLimit(
  key: string,
  client: Pick<typeof db, "securityRateBucket"> = db,
) {
  await client.securityRateBucket.deleteMany({
    where: { key: createHash("sha256").update(key).digest("hex") },
  });
}
