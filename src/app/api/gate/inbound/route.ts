import { json, error } from "@/lib/api";
import { publicFailure } from "@/lib/security/api-errors";
import { inboundSchema } from "@/lib/gate/contract";
import { authenticateInbound } from "@/lib/gate/inbound-auth";
import { movementReceipt, receiveMovement } from "@/lib/gate/service";

/** The inventory system announces an expected arrival or departure. Safe to repeat with the same reference. */
export async function POST(req: Request) {
  try {
    const { body, sites } = await authenticateInbound(req);
    const d = inboundSchema.parse(JSON.parse(body));
    if (!sites.includes(d.locationId)) return error("Site is not enabled for this connection", 403);
    return json(movementReceipt(await receiveMovement(d)));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
export const maxDuration = 60;
