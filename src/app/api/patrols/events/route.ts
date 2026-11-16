import { publicFailure } from "@/lib/security/api-errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { json, error } from "@/lib/api";
import { authenticateGateway } from "@/lib/gateway/auth";
import { recordPatrolScan } from "@/lib/patrol/service";
export async function POST(req: Request) {
  const auth = await authenticateGateway(req);
  if (!auth.device) return error(auth.error, auth.status);
  const limit = await rateLimit(`patrol-events:${auth.device.id}`, 30, 60000);
  if (!limit.ok) return error("Too many patrol uploads", 429);
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.events) || !body.events.length || body.events.length > 100)
    return error("Send 1–100 events");
  const sentAt = Date.parse(String(body.sentAt ?? ""));
  const offsetMs = Date.now() - sentAt;
  const uncertain = !Number.isFinite(offsetMs) || Math.abs(offsetMs) >= 7 * 86400000;
  const clock = { offsetMs: uncertain ? 0 : offsetMs, uncertain };
  const acks = [];
  for (const event of body.events.slice(0, 20)) {
    try {
      acks.push(await recordPatrolScan(auth.device.id, event, new Date(), clock));
    } catch (e) {
      const failure = publicFailure(e);
      acks.push({
        eventId: event?.eventId,
        status: failure.retryable ? "retry" : "rejected",
        error: failure.message,
      });
      if (failure.retryable) break; // Keep unsent rows on the device; do not amplify a database outage.
    }
  }
  return json({ acks });
}
