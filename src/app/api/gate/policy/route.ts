import { guarded, json } from "@/lib/api";
import { db } from "@/lib/db";
import { portalSite } from "@/lib/gate/service";
import { z } from "zod";
export const POST = guarded("ADMIN", async (req, _ctx, user) => {
  const d = z
    .object({ locationId: z.string().min(1), guardCanApprove: z.boolean() })
    .parse(await req.json());
  await portalSite(user, d.locationId);
  return json(
    await db.$transaction(async (tx) => {
      const p = await tx.gatePolicy.upsert({
        where: { locationId: d.locationId },
        create: d,
        update: { guardCanApprove: d.guardCanApprove },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          actor: user.name,
          action: "GATE_POLICY_CHANGED",
          entity: "Location",
          entityId: d.locationId,
          details: d,
        },
      });
      return p;
    }),
  );
});
