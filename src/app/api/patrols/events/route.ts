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
  if (!Array.isArray(body?.events) || !body.events.length || body.events.length > 20)
    return error("Send 1–20 events per request");
  const sentAt = Date.parse(String(body.sentAt ?? ""));
  const offsetMs = Date.now() - sentAt;
  const uncertain = !Number.isFinite(offsetMs) || Math.abs(offsetMs) >= 7 * 86400000;
  const clock = { offsetMs: uncertain ? 0 : offsetMs, uncertain };
  const acks = [];
  for (const event of body.events) {
    try {
      acks.push(await recordPatrolScan(auth.device.id, event, new Date(), clock));
    } catch (e) {
      const failure = publicFailure(e);
      acks.push({
        eventId: event?.eventId,
        status: failure.retryable ? "retry" : "rejected",
        error: failure.message,
      });
      // A database outage (503) stops the batch so we do not amplify it. Any other unexpected
      // failure is specific to this event: keep it queued on the phone but carry on with the rest,
      // so one poison event can never starve everything behind it.
      if (failure.status === 503) break;
    }
  }
  return json({ acks });
}
