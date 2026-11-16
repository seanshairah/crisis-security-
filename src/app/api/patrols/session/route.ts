import { publicFailure } from "@/lib/security/api-errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { json, error } from "@/lib/api";
import { authenticateGateway } from "@/lib/gateway/auth";
import { endPatrolSession, patrolConfig, startPatrolSession } from "@/lib/patrol/service";
import { z } from "zod";
export async function GET(req: Request) {
  const auth = await authenticateGateway(req);
  if (!auth.device) return error(auth.error, auth.status);
  return json(await patrolConfig(auth.device.id));
}
export async function POST(req: Request) {
  const auth = await authenticateGateway(req);
  if (!auth.device) return error(auth.error, auth.status);
  const limit = await rateLimit(`patrol-session:${auth.device.id}`, 60, 60000);
  if (!limit.ok) return error("Too many sign-in requests. Try again shortly.", 429);
  try {
    const d = z
      .object({ guardNo: z.string().trim().min(1).max(100), pin: z.string().regex(/^\d{6,12}$/) })
      .parse(await req.json());
    return json(await startPatrolSession(auth.device.id, d.guardNo, d.pin));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
export async function DELETE(req: Request) {
  const auth = await authenticateGateway(req);
  if (!auth.device) return error(auth.error, auth.status);
  const limit = await rateLimit(`patrol-session:${auth.device.id}`, 60, 60000);
  if (!limit.ok) return error("Too many sign-in requests. Try again shortly.", 429);
  try {
    const d = z.object({ sessionId: z.string().min(1).max(100) }).parse(await req.json());
    await endPatrolSession(auth.device.id, d.sessionId);
    return json({ ok: true });
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
