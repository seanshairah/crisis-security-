import { json, error } from "@/lib/api";
import { publicFailure } from "@/lib/security/api-errors";
import { authenticateInbound } from "@/lib/gate/inbound-auth";
import { movementStatusByReference } from "@/lib/gate/service";

/** Poll the state of a record the inventory system sent: gate decision and delivery progress. */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  try {
    const { sites } = await authenticateInbound(req);
    const { reference } = await ctx.params;
    return json(await movementStatusByReference(reference, sites));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
