import { gateBody } from "@/lib/gate/contract";
import { secretMatches } from "@/lib/security/secrets";
import { json, error } from "@/lib/api";
import { publicFailure } from "@/lib/security/api-errors";
import { receiveMovement } from "@/lib/gate/service";
import { inboundSchema } from "@/lib/gate/contract";
import { rateLimit } from "@/lib/security/rate-limit";
export async function POST(req: Request) {
  const key = process.env.GATE_INBOUND_TOKEN;
  if (
    !key ||
    key.length < 32 ||
    !secretMatches(key, req.headers.get("authorization")?.replace(/^Bearer /, ""))
  )
    return error("Unauthorised", 401);
  if (!(await rateLimit("gate:inbound", 120, 60000)).ok) return error("Please retry shortly", 429);
  try {
    const d = inboundSchema.parse(await gateBody(req));
    const sites = (process.env.GATE_INBOUND_SITE_IDS ?? "").split(",").map((s) => s.trim());
    if (!sites.includes(d.locationId)) return error("Site is not enabled for this connection", 403);
    return json(await receiveMovement(d));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
