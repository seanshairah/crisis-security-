import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/security/api-errors";
import {
  canonical,
  commandSchema,
  detailsSchema,
  differences,
  gateDecision,
  inboundSchema,
} from "./contract";
import type { SessionUser } from "@/lib/auth/session";
import { verifyCoordinateQr } from "@/lib/patrol/checkpoint-qr";
export async function portalSite(user: SessionUser, locationId: string) {
  const site = await db.location.findFirst({
    where: { id: locationId, ...(user.role === "SUPERVISOR" ? { supervisorId: user.id } : {}) },
  });
  if (!site) throw new DomainError("This site is not assigned to you", 403);
  return site;
}
export async function deviceSession(
  deviceId: string,
  sessionId: string,
  capturedAt = new Date().toISOString(),
  offline = false,
) {
  const s = await db.patrolSession.findFirst({
    where: { id: sessionId, deviceId },
    include: { shift: { include: { guard: true, location: true } } },
  });
  const at = new Date(capturedAt).getTime(),
    now = Date.now();
  if (
    !s ||
    !s.shift.guard.active ||
    !s.shift.location.active ||
    ["CANCELLED", "MISSED"].includes(s.shift.status) ||
    at > now + 60_000 ||
    now - at > 7 * 86400_000 ||
    at < s.startedAt.getTime() ||
    at >= s.expiresAt.getTime() ||
    (s.endedAt && (!offline || at >= s.endedAt.getTime()))
  )
    throw new DomainError("Sign in for an active shift at this site", 403);
  return s;
}
/** The only shape the inventory system ever sees of a movement: no guard, session or device identifiers. */
export function movementReceipt(
  m: {
    id: string;
    sourceReference: string;
    status: string;
    version: number;
    direction: string;
    reason: string | null;
    decisionBy: string | null;
    decisionAt: Date | null;
    correctionOf: string | null;
  },
  delivery?: { status: string; attempts: number; sentAt: Date | null; deadAt: Date | null } | null,
) {
  return {
    movementId: m.id,
    reference: m.sourceReference.replace(/^external:/, ""),
    direction: m.direction,
    status: m.status,
    version: m.version,
    reason: m.reason,
    decidedAt: m.decisionAt,
    decidedByRole: m.decisionBy?.startsWith("guard:")
      ? "GUARD"
      : m.decisionBy?.startsWith("user:")
        ? "SUPERVISOR"
        : null,
    correctionOf: m.correctionOf,
    delivery: delivery
      ? {
          status: delivery.deadAt ? "NEEDS_ATTENTION" : delivery.status,
          attempts: delivery.attempts,
          sentAt: delivery.sentAt,
        }
      : null,
  };
}

export async function receiveMovement(input: unknown) {
  const d = inboundSchema.parse(input);
  const site = await db.location.findUnique({
    where: { id: d.locationId },
    select: { active: true },
  });
  if (!site?.active) throw new DomainError("Site not found or not active", 404);
  const existing = await db.gateMovement.findUnique({
    where: { sourceReference: `external:${d.reference}` },
  });
  if (existing) {
    if (
      existing.locationId !== d.locationId ||
      existing.direction !== d.direction ||
      canonical(existing.expected) !== canonical(d.details)
    )
      throw new DomainError("Reference already exists with different details", 409);
    return existing;
  }
  try {
    return await db.gateMovement.create({
      data: {
        locationId: d.locationId,
        source: "EXTERNAL",
        sourceReference: `external:${d.reference}`,
        direction: d.direction,
        expected: d.details,
        history: { create: { actor: "inventory-system", action: "SUBMITTED", details: d } },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return receiveMovement(d);
    throw e;
  }
}
export async function applyGuardCommand(deviceId: string, input: unknown) {
  const d = commandSchema.parse(input);
  const s = await deviceSession(deviceId, d.sessionId, d.capturedAt, true);
  const actual = new Date(d.details.occurredAt).getTime(),
    captured = new Date(d.capturedAt).getTime();
  if (actual > captured + 60_000 || captured - actual > 7 * 86400_000)
    throw new DomainError("Enter an actual movement time within the past seven days");
  const cp = await db.patrolCheckpoint.findFirst({
    where: { id: d.checkpointId, locationId: s.shift.locationId, active: true },
  });
  if (!cp) throw new DomainError("Choose an active checkpoint at your assigned site", 403);
  const policy = await db.gatePolicy.findUnique({ where: { locationId: s.shift.locationId } });
  return db.$transaction(async (tx) => {
    // Serialize replay checks and decisions, including concurrent requests from the same device.
    await tx.$queryRaw`SELECT id FROM "PatrolSession" WHERE id=${s.id} FOR UPDATE`;
    const live = await tx.patrolSession.findUniqueOrThrow({ where: { id: s.id } });
    // Delayed offline records retain attribution but require a supervisor's current decision.
    const mayApprove =
      !!policy?.guardCanApprove &&
      !live.endedAt &&
      live.expiresAt.getTime() > Date.now() &&
      Date.now() - captured <= 15 * 60_000;
    const prior = await tx.gateHistory.findFirst({
      where: { actor: `guard:${s.shift.guardId}`, action: `COMMAND:${d.commandId}` },
      include: { movement: true },
    });
    if (prior) {
      if (canonical(prior.details) !== canonical(d))
        throw new DomainError("Command reference already used with different details", 409);
      return prior.movement;
    }
    let m;
    if (d.action === "RECORD") {
      m = await tx.gateMovement.create({
        data: {
          locationId: s.shift.locationId,
          source: "GUARD",
          sourceReference: `guard:${d.commandId}`,
          direction: d.direction,
          observed: d.details,
          checkpointId: cp.id,
          sessionId: s.id,
          guardId: s.shift.guardId,
          shiftId: s.shiftId,
          capturedAt: new Date(captured),
          receivedAt: new Date(),
          status: mayApprove ? "APPROVED" : "REVIEW",
          decisionBy: mayApprove ? `guard:${s.shift.guardId}` : null,
          decisionAt: mayApprove ? new Date() : null,
        },
      });
    } else {
      const old = await tx.gateMovement.findFirst({
        where: { id: d.movementId, locationId: s.shift.locationId },
      });
      if (!old) throw new DomainError("Movement not found at your site", 404);
      if (!["PENDING", "REVIEW"].includes(old.status) || old.version !== d.version || old.observed)
        throw new DomainError("Movement already checked or changed. Refresh its status.", 409);
      const mismatch =
        !!old.expected && differences(detailsSchema.parse(old.expected), d.details).length > 0;
      let status: "APPROVED" | "REJECTED" | "REVIEW";
      try {
        status = gateDecision(d.decision, mismatch, mayApprove ?? false, d.reason);
      } catch (e) {
        throw new DomainError((e as Error).message);
      }
      const changed = await tx.gateMovement.updateMany({
        where: { id: old.id, version: d.version },
        data: {
          observed: d.details,
          checkpointId: cp.id,
          sessionId: s.id,
          guardId: s.shift.guardId,
          shiftId: s.shiftId,
          capturedAt: new Date(captured),
          receivedAt: new Date(),
          status,
          reason: d.reason,
          decisionBy: status === "REVIEW" ? null : `guard:${s.shift.guardId}`,
          decisionAt: status === "REVIEW" ? null : new Date(),
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new DomainError("Movement changed. Refresh and try again", 409);
      m = await tx.gateMovement.findUniqueOrThrow({ where: { id: old.id } });
    }
    await tx.gateHistory.create({
      data: {
        movementId: m.id,
        actor: `guard:${s.shift.guardId}`,
        action: `COMMAND:${d.commandId}`,
        details: d,
      },
    });
    await queueDecision(tx, m.id);
    return m;
  });
}
async function queueDecision(tx: Prisma.TransactionClient, id: string) {
  const m = await tx.gateMovement.findUniqueOrThrow({
    where: { id },
    include: { location: { select: { name: true } } },
  });
  if (!["APPROVED", "REJECTED"].includes(m.status)) return;
  const [guardRow, checkpoint] = await Promise.all([
    m.guardId
      ? tx.guard.findUnique({
          where: { id: m.guardId },
          select: { id: true, guardNo: true, firstName: true, lastName: true },
        })
      : null,
    m.checkpointId
      ? tx.patrolCheckpoint.findUnique({
          where: { id: m.checkpointId },
          select: { id: true, name: true },
        })
      : null,
  ]);
  const guard = guardRow && {
    id: guardRow.id,
    guardNo: guardRow.guardNo,
    name: `${guardRow.firstName} ${guardRow.lastName}`.trim(),
  };
  // Frozen at decision time: names are copied in so a later rename never rewrites what was sent.
  await tx.gateDelivery.create({
    data: {
      movementId: id,
      version: m.version,
      payload: JSON.parse(
        JSON.stringify({
          event: "gate.decision.v1",
          schemaVersion: 1,
          movementId: m.id,
          reference: m.sourceReference,
          externalReference:
            m.source === "EXTERNAL" ? m.sourceReference.replace(/^external:/, "") : null,
          source: m.source,
          locationId: m.locationId,
          siteName: m.location.name,
          guard,
          checkpoint,
          capturedAt: m.capturedAt,
          receivedAt: m.receivedAt,
          decidedByRole: m.decisionBy?.startsWith("guard:") ? "GUARD" : "SUPERVISOR",
          direction: m.direction,
          expected: m.expected,
          observed: m.observed,
          discrepancies:
            m.expected && m.observed
              ? differences(detailsSchema.parse(m.expected), detailsSchema.parse(m.observed))
              : [],
          status: m.status,
          reason: m.reason,
          guardId: m.guardId,
          shiftId: m.shiftId,
          checkpointId: m.checkpointId,
          decisionBy: m.decisionBy,
          decisionAt: m.decisionAt,
          version: m.version,
          correctionOf: m.correctionOf,
        }),
      ),
    },
  });
}
export async function supervisorDecision(
  user: SessionUser,
  id: string,
  version: number,
  decision: "APPROVED" | "REJECTED",
  reason: string,
) {
  const m = await db.gateMovement.findUniqueOrThrow({ where: { id } });
  await portalSite(user, m.locationId);
  if (!reason.trim()) throw new DomainError("Enter the reason for your decision");
  return db.$transaction(async (tx) => {
    const r = await tx.gateMovement.updateMany({
      where: {
        id,
        version,
        status: { in: ["PENDING", "REVIEW"] },
        observed: { not: Prisma.DbNull },
      },
      data: {
        status: decision,
        reason,
        decisionBy: `user:${user.id}`,
        decisionAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!r.count)
      throw new DomainError(
        "A physical check is required, or this movement has already changed",
        409,
      );
    await tx.gateHistory.create({
      data: { movementId: id, actor: `user:${user.id}`, action: decision, details: { reason } },
    });
    await queueDecision(tx, id);
  });
}
export async function listForGuard(deviceId: string, sessionId: string, q = "") {
  const s = await deviceSession(deviceId, sessionId);
  q = q.trim();
  if (q.length > 200) throw new DomainError("Search text is too long");
  let checkpointId: string | undefined;
  if (q.startsWith("CS2|")) {
    const cp = await db.patrolCheckpoint.findFirst({
      where: { id: q.split("|")[1], locationId: s.shift.locationId, active: true },
    });
    if (!cp || cp.qrPayload !== q || !verifyCoordinateQr(q, cp))
      throw new DomainError("Invalid checkpoint code for your site", 403);
    checkpointId = cp.id;
    q = "";
  }
  if (q.startsWith("GM1:")) q = q.slice(4);
  const items = await db.gateMovement.findMany({
    where: {
      locationId: s.shift.locationId,
      ...(q
        ? {
            OR: [
              { id: q },
              { sourceReference: { contains: q, mode: "insensitive" } },
              { observed: { path: ["registration"], string_contains: q } },
              { expected: { path: ["registration"], string_contains: q } },
            ],
          }
        : { OR: [{ status: { in: ["PENDING", "REVIEW"] } }, { sessionId: s.id }] }),
    },
    include: {
      deliveries: {
        select: { status: true, lastError: true, deadAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (q && !items.length)
    throw new DomainError("No movement found at your site. Check the code or reference.", 404);
  return {
    items,
    checkpointId,
    siteName: (await db.location.findUniqueOrThrow({ where: { id: s.shift.locationId } })).name,
    checkpoints: await db.patrolCheckpoint.findMany({
      where: { locationId: s.shift.locationId, active: true },
      select: { id: true, name: true },
    }),
  };
}

/** An amendment creates a new reviewable record; the cleared original and its delivery remain immutable. */
export async function correctMovement(
  user: SessionUser,
  id: string,
  input: unknown,
  reason: string,
) {
  const details = detailsSchema.parse(input);
  if (!reason.trim()) throw new DomainError("Explain the correction");
  const m = await db.gateMovement.findUniqueOrThrow({ where: { id } });
  await portalSite(user, m.locationId);
  if (!["APPROVED", "REJECTED"].includes(m.status))
    throw new DomainError("Review the pending movement before making an amendment", 409);
  return db.$transaction(async (tx) => {
    // One open amendment per record: serialise on the original, then refuse a second.
    await tx.$queryRaw`SELECT id FROM "GateMovement" WHERE id=${id} FOR UPDATE`;
    if (
      await tx.gateMovement.count({
        where: { correctionOf: id, status: { in: ["PENDING", "REVIEW"] } },
      })
    )
      throw new DomainError("This record already has an amendment awaiting review", 409);
    const n = await tx.gateMovement.create({
      data: {
        locationId: m.locationId,
        source: "CORRECTION",
        sourceReference: `correction:${crypto.randomUUID()}`,
        direction: m.direction,
        expected: m.observed ?? m.expected ?? Prisma.JsonNull,
        observed: details,
        correctionOf: m.id,
        checkpointId: m.checkpointId,
        guardId: m.guardId,
        sessionId: m.sessionId,
        shiftId: m.shiftId,
        status: "REVIEW",
        reason,
        history: {
          create: {
            actor: `user:${user.id}`,
            action: "CORRECTION_CREATED",
            details: { originalId: id, reason },
          },
        },
      },
    });
    await tx.gateHistory.create({
      data: {
        movementId: id,
        actor: `user:${user.id}`,
        action: "CORRECTION_REQUESTED",
        details: { correctionId: n.id, reason },
      },
    });
    return n;
  });
}

/** Inventory-system lookups are scoped to the site list this connection is allowed to use. */
async function externalMovement(reference: string, sites: string[]) {
  const m = await db.gateMovement.findUnique({
    where: { sourceReference: `external:${reference}` },
    include: { deliveries: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!m || !sites.includes(m.locationId)) throw new DomainError("Reference not found", 404);
  return m;
}

export async function movementStatusByReference(reference: string, sites: string[]) {
  const m = await externalMovement(reference, sites);
  return movementReceipt(m, m.deliveries[0]);
}

/** The inventory system withdraws a record only while no guard has physically checked it. */
export async function cancelExternalMovement(reference: string, sites: string[], reason: string) {
  const m = await externalMovement(reference, sites);
  if (m.status === "CANCELLED") return movementReceipt(m, m.deliveries[0]);
  return db.$transaction(async (tx) => {
    const r = await tx.gateMovement.updateMany({
      where: {
        id: m.id,
        version: m.version,
        status: "PENDING",
        observed: { equals: Prisma.DbNull },
      },
      data: {
        status: "CANCELLED",
        reason: reason || "Withdrawn by the inventory system",
        decisionBy: "inventory-system",
        decisionAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!r.count)
      throw new DomainError(
        "A guard has already checked this record, so it cannot be withdrawn",
        409,
      );
    await tx.gateHistory.create({
      data: {
        movementId: m.id,
        actor: "inventory-system",
        action: "CANCELLED",
        details: { reason },
      },
    });
    const n = await tx.gateMovement.findUniqueOrThrow({ where: { id: m.id } });
    return movementReceipt(n, null);
  });
}
