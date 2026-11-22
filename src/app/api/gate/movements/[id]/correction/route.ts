import { guarded, json } from "@/lib/api";
import { correctMovement } from "@/lib/gate/service";
import { detailsSchema } from "@/lib/gate/contract";
import { z } from "zod";
export const POST = guarded("SUPERVISOR", async (req, ctx, user) => {
  const { id } = await ctx.params;
  const d = z
    .object({ details: detailsSchema, reason: z.string().trim().min(1).max(2000) })
    .parse(await req.json());
  return json(await correctMovement(user, id, d.details, d.reason));
});
