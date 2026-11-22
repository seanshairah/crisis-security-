import { json, error } from "@/lib/api";
import { z } from "zod";
import { publicFailure } from "@/lib/security/api-errors";
import { authenticateInbound } from "@/lib/gate/inbound-auth";
import { cancelExternalMovement } from "@/lib/gate/service";

/** Withdraw a record nobody has physically checked yet. Repeating the call is harmless. */
export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  try {
    const { body, sites } = await authenticateInbound(req);
    const { reason } = z
      .object({ reason: z.string().trim().max(500).default("") })
      .parse(body ? JSON.parse(body) : {});
    const { reference } = await ctx.params;
    return json(await cancelExternalMovement(reference, sites, reason));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
