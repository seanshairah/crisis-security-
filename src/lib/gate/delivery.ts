import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
export function deliveryTarget() {
  const raw = process.env.GATE_OUTBOUND_URL;
  if (!raw || !process.env.GATE_OUTBOUND_TOKEN || process.env.GATE_OUTBOUND_TOKEN.length < 32)
    throw new Error("Inventory connection is not configured");
  const u = new URL(raw);
  if (
    u.username ||
    u.password ||
    u.hash ||
    (u.protocol !== "https:" &&
      !(
        process.env.GATE_ALLOW_LOCAL_TEST === "true" &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      ))
  )
    throw new Error("Inventory connection must use HTTPS");
  return u.toString();
}
/** Lease and stable delivery ID make retry safe; receiver must persist that ID before acknowledging. */
export async function deliverGateDecisions(limit = 10) {
  const due = await db.gateDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } },
        { status: "SENDING", leaseUntil: { lt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const d of due) {
    const leaseUntil = new Date(Date.now() + 60_000);
    const claim = await db.gateDelivery.updateMany({
      where: { id: d.id, status: d.status, leaseUntil: d.leaseUntil },
      data: { status: "SENDING", leaseUntil, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    let detail = "Inventory service unavailable. Automatic retry pending.",
      success = false;
    try {
      const response = await fetch(deliveryTarget(), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.GATE_OUTBOUND_TOKEN}`,
          "idempotency-key": d.id,
          "x-request-id": randomUUID(),
        },
        body: JSON.stringify({ deliveryId: d.id, ...(d.payload as object) }),
      });
      if (!response.ok)
        detail = `Inventory service returned HTTP ${response.status}. Retry pending.`;
      else {
        const acknowledgement = await response.json();
        success = acknowledgement?.deliveryId === d.id && acknowledgement?.accepted === true;
        detail = success
          ? "Acknowledged by inventory system"
          : "Inventory service did not acknowledge this delivery ID. Retry pending.";
      }
    } catch {
      /* Never put external response bodies, tokens, or network details in the visible log. */
    }
    await db.$transaction(async (tx) => {
      const r = await tx.gateDelivery.updateMany({
        where: { id: d.id, status: "SENDING", leaseUntil },
        data: {
          status: success ? "SENT" : "FAILED",
          leaseUntil: null,
          lastError: success ? null : detail,
          sentAt: success ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600, 2 ** Math.min(d.attempts + 1, 10) * 15) * 1000,
          ),
        },
      });
      if (r.count)
        await tx.gateDeliveryAttempt.create({ data: { deliveryId: d.id, success, detail } });
    });
    if (success) sent++;
  }
  return { checked: due.length, sent };
}
