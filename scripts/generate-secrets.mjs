/** Prints fresh random values for the secrets the portal needs. Paste them into Vercel's environment variables. */
import { randomBytes } from "node:crypto";
const s = () => randomBytes(32).toString("base64url");
for (const k of [
  "AUTH_SECRET",
  "CRON_SECRET",
  "AUTOMATION_SECRET",
  "PATROL_QR_SIGNING_SECRET",
  "SMS_WEBHOOK_SECRET",
])
  console.log(`${k}=${s()}`);
console.log(`ADMIN_PASSWORD=${randomBytes(12).toString("base64url")}`);
