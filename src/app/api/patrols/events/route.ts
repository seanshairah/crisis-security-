import { json, error } from '@/lib/api';
import { authenticateGateway } from '@/lib/gateway/auth';
import { recordPatrolScan } from '@/lib/patrol/service';
export async function POST(req: Request) {
  const auth = await authenticateGateway(req);
  if (!auth.device) return error(auth.error, auth.status);
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.events) || !body.events.length || body.events.length > 100) return error('Send 1–100 events');
  const acks = [];
  for (const event of body.events) {
    try { acks.push(await recordPatrolScan(auth.device.id, event)); }
    catch (e) {
      // Storage failures cause transport retry; invalid evidence stays visible in handset diagnostics.
      if (e && typeof e === 'object' && 'code' in e && !['P2025'].includes(String(e.code))) throw e;
      acks.push({ eventId: event?.eventId, status: 'rejected', error: e instanceof Error ? e.message : 'Invalid event' });
    }
  }
  return json({ acks });
}
