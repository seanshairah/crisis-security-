import { guarded, json, error } from "@/lib/api";
import { db } from "@/lib/db";
import { portalSite, supervisorDecision } from "@/lib/gate/service";
import { z } from "zod";
export const GET = guarded("SUPERVISOR", async (_req, ctx, user) => {
  const { id } = await ctx.params;
  const m = await db.gateMovement.findUniqueOrThrow({
    where: { id },
    include: {
      history: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { attemptsLog: { orderBy: { createdAt: "desc" }, take: 20 } } },
    },
  });
  await portalSite(user, m.locationId);
  return json(m);
});
export const POST = guarded("SUPERVISOR", async (req, ctx, user) => {
  const { id } = await ctx.params;
  const d = z
    .object({
      version: z.number().int().positive(),
      decision: z.enum(["APPROVED", "REJECTED", "RETRY"]),
      reason: z.string().trim().max(2000).default(""),
    })
    .parse(await req.json());
  if (d.decision === "RETRY") {
    const m = await db.gateMovement.findUniqueOrThrow({ where: { id } });
    await portalSite(user, m.locationId);
    const r = await db.gateDelivery.updateMany({
      where: { movementId: id, status: "FAILED" },
      data: { status: "PENDING", nextAttemptAt: new Date() },
    });
    if (!r.count) return error("No failed delivery to retry", 409);
    await db.gateHistory.create({
      data: { movementId: id, actor: `user:${user.id}`, action: "RETRY", details: {} },
    });
  } else await supervisorDecision(user, id, d.version, d.decision, d.reason);
  return json({ ok: true });
});
