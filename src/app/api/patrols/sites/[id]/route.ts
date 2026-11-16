import QRCode from "qrcode";
import { guarded, json } from "@/lib/api";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { createCoordinateQr } from "@/lib/patrol/checkpoint-qr";
import { checkpointSchema, policySchema } from "@/lib/patrol/validation";
import { qrHash, serial } from "@/lib/patrol/service";
export const GET = guarded("SUPERVISOR", async (_req, ctx) => {
  const { id } = await ctx.params;
  return json(
    await db.location.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        patrolPolicy: true,
        checkpoints: { orderBy: { createdAt: "asc" } },
      },
    }),
  );
});
export const PUT = guarded("ADMIN", async (req, ctx, user) => {
  const { id } = await ctx.params;
  const policy = policySchema.parse(await req.json());
  return json(
    await serial(async (tx) => {
      const l = await tx.location.findUniqueOrThrow({ where: { id } });
      if (!l.active) throw Error("Site is inactive");
      if (
        policy.enabled &&
        !(await tx.patrolCheckpoint.count({ where: { locationId: id, active: true } }))
      )
        throw Error("Add a checkpoint before enabling patrols");
      const p = await tx.patrolPolicy.upsert({
        where: { locationId: id },
        create: { locationId: id, ...policy },
        update: { ...policy, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          actor: user.name,
          action: "PATROL_POLICY_UPDATED",
          entity: "Location",
          entityId: id,
          details: policy,
        },
      });
      return p;
    }),
  );
});
export const POST = guarded("ADMIN", async (req, ctx, user) => {
  const { id } = await ctx.params;
  const data = checkpointSchema.parse(await req.json());
  const checkpointId = randomUUID();
  const qr = createCoordinateQr({ id: checkpointId, locationId: id, ...data });
  const checkpoint = await serial(async (tx) => {
    const l = await tx.location.findUniqueOrThrow({ where: { id } });
    if (!l.active) throw Error("Site is inactive");
    const c = await tx.patrolCheckpoint.create({
      data: {
        id: checkpointId,
        ...data,
        locationId: id,
        qrHash: qrHash(qr),
        qrPayload: qr,
        qrVersion: 2,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        actor: user.name,
        action: "PATROL_CHECKPOINT_CREATED",
        entity: "Location",
        entityId: id,
        details: { checkpointId: c.id, name: c.name },
      },
    });
    return c;
  });
  return json(
    {
      checkpoint,
      qrImage: await QRCode.toDataURL(qr, { width: 1000, margin: 4, errorCorrectionLevel: "M" }),
    },
    201,
  );
});
export const DELETE = guarded("ADMIN", async (req, ctx, user) => {
  const { id } = await ctx.params;
  const { checkpointId } = await req.json();
  if (typeof checkpointId !== "string") throw Error("Checkpoint ID required");
  await serial(async (tx) => {
    const c = await tx.patrolCheckpoint.findFirstOrThrow({
      where: { id: checkpointId, locationId: id },
    });
    await tx.patrolCheckpoint.update({ where: { id: c.id }, data: { active: false } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        actor: user.name,
        action: "PATROL_CHECKPOINT_ARCHIVED",
        entity: "Location",
        entityId: id,
        details: { checkpointId },
      },
    });
  });
  return json({ ok: true });
});
