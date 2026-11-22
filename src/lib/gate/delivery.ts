import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { notify } from "@/lib/notifications";
import { maxAttempts, outboundConfig } from "./config";
import { signGateBody } from "./signing";

/** Kept for callers that only need the validated URL. Throws when the connection is unusable. */
export function deliveryTarget() {
  const c = outboundConfig();
  if (!c.ok) throw new Error(c.problems[0]);
  return c.url;
}

type Outcome = { success: boolean; permanent: boolean; detail: string; status?: number };

/** 4xx other than these means the receiver understood and refused: retrying the same bytes cannot help. */
const RETRYABLE_4XX = new Set([401, 403, 404, 408, 409, 423, 425, 429]);

export function backoffSeconds(attempts: number, rand = Math.random()): number {
  const base = Math.min(3600, 2 ** Math.min(attempts + 1, 10) * 15);
  return Math.round(base * (0.8 + rand * 0.4));
}

/** Signed POST of one frozen payload. Never puts response bodies, tokens or network detail in the visible log. */
export async function postSigned(
  url: string,
  token: string,
  secret: string,
  event: string,
  deliveryId: string,
  payload: object,
): Promise<Outcome> {
  const body = JSON.stringify({ deliveryId, ...payload });
  const timestamp = Math.floor(Date.now() / 1000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "user-agent": "CrisisSecurityGate/1",
        authorization: `Bearer ${token}`,
        "idempotency-key": deliveryId,
        "x-request-id": randomUUID(),
        "x-crisis-event": event,
        "x-crisis-delivery": deliveryId,
        "x-crisis-timestamp": String(timestamp),
        "x-crisis-signature": signGateBody(secret, timestamp, body),
      },
      body,
    });
  } catch {
    return {
      success: false,
      permanent: false,
      detail: "Inventory service unreachable. Retry pending.",
    };
  }
  const status = response.status;
  let ack: { accepted?: unknown; deliveryId?: unknown; retryable?: unknown } | null = null;
  try {
    const text = await response.text();
    if (text.length <= 10_000) ack = JSON.parse(text);
  } catch {
    ack = null;
  }
  if (response.ok && ack?.deliveryId === deliveryId && ack?.accepted === true)
    return { success: true, permanent: false, detail: "Acknowledged by inventory system", status };
  if (response.ok)
    return {
      success: false,
      permanent: ack?.accepted === false && ack?.retryable === false,
      detail:
        ack?.accepted === false
          ? "Inventory system refused this record."
          : "Inventory service did not acknowledge this delivery ID. Retry pending.",
      status,
    };
  const permanent = status >= 400 && status < 500 && !RETRYABLE_4XX.has(status);
  return {
    success: false,
    permanent,
    status,
    detail: permanent
      ? `Inventory service rejected the record (HTTP ${status}).`
      : `Inventory service returned HTTP ${status}. Retry pending.`,
  };
}

/** A correction must never overtake the decision it amends. */
async function waitingOnOriginal(correctionOf: string | null): Promise<boolean> {
  if (!correctionOf) return false;
  return (
    (await db.gateDelivery.count({
      where: { movementId: correctionOf, status: { not: "SENT" } },
    })) > 0
  );
}

/** Lease and stable delivery ID make retry safe; the receiver must persist that ID before acknowledging. */
export async function deliverGateDecisions(limit = 10) {
  const cfg = outboundConfig();
  if (!cfg.ok) return { checked: 0, sent: 0, configured: false as const };
  const now = new Date();
  const due = await db.gateDelivery.findMany({
    where: {
      deadAt: null,
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "SENDING", leaseUntil: { lt: now } },
      ],
    },
    include: { movement: { select: { correctionOf: true, locationId: true } } },
    orderBy: { createdAt: "asc" },
    take: limit * 3,
  });
  let sent = 0,
    handled = 0;
  for (const d of due) {
    if (handled >= limit) break;
    if (await waitingOnOriginal(d.movement.correctionOf)) continue;
    const leaseUntil = new Date(Date.now() + 60_000);
    const claim = await db.gateDelivery.updateMany({
      where: { id: d.id, status: d.status, leaseUntil: d.leaseUntil },
      data: { status: "SENDING", leaseUntil, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    handled++;
    const attempts = d.attempts + 1;
    const started = Date.now();
    const out = await postSigned(
      cfg.url,
      cfg.token,
      cfg.secret,
      "gate.decision.v1",
      d.id,
      d.payload as object,
    );
    const dead = !out.success && (out.permanent || attempts >= maxAttempts());
    const marked = await db.$transaction(async (tx) => {
      const r = await tx.gateDelivery.updateMany({
        where: { id: d.id, status: "SENDING", leaseUntil },
        data: {
          status: out.success ? "SENT" : "FAILED",
          leaseUntil: null,
          lastError: out.success ? null : out.detail,
          sentAt: out.success ? new Date() : null,
          deadAt: dead ? new Date() : null,
          nextAttemptAt: new Date(Date.now() + backoffSeconds(attempts) * 1000),
        },
      });
      if (r.count)
        await tx.gateDeliveryAttempt.create({
          data: {
            deliveryId: d.id,
            success: out.success,
            detail: out.detail,
            httpStatus: out.status ?? null,
            durationMs: Date.now() - started,
          },
        });
      return r.count > 0;
    });
    if (out.success && marked) sent++;
    if (dead && marked)
      await notify({
        type: "STATUS_UPDATE",
        severity: "CRITICAL",
        title: "Inventory update needs attention",
        body: "A gate decision could not be delivered to the inventory system and automatic retries have stopped. Open Gate Inventory to retry.",
        url: "/gate-inventory",
      }).catch(() => undefined);
  }
  return { checked: due.length, sent, configured: true as const };
}

/** Admin connectivity check: a signed ping that creates no movement and no delivery row. */
export async function pingInventory() {
  const cfg = outboundConfig();
  if (!cfg.ok) return { ok: false, detail: cfg.problems[0], problems: cfg.problems };
  const id = randomUUID();
  const started = Date.now();
  const out = await postSigned(cfg.url, cfg.token, cfg.secret, "gate.ping.v1", id, {
    event: "gate.ping.v1",
    sentAt: new Date().toISOString(),
  });
  return {
    ok: out.success,
    detail: out.success ? "Inventory system acknowledged the test." : out.detail,
    status: out.status ?? null,
    ms: Date.now() - started,
  };
}
