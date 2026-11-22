import { db } from "@/lib/db";
import { inboundStatus, outboundConfig } from "./config";

/** Everything the admin screen needs about the inventory connection. Contains no secrets. */
export async function integrationStatus() {
  const out = outboundConfig();
  const inn = inboundStatus();
  const [groups, dead, lastOk, lastFail, oldest] = await Promise.all([
    db.gateDelivery.groupBy({ by: ["status"], _count: true }),
    db.gateDelivery.count({ where: { deadAt: { not: null } } }),
    db.gateDelivery.findFirst({
      where: { status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    db.gateDeliveryAttempt.findFirst({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, detail: true, httpStatus: true },
    }),
    db.gateDelivery.findFirst({
      where: { status: { in: ["PENDING", "FAILED", "SENDING"] }, deadAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  const count = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  return {
    outbound: {
      configured: out.ok,
      problems: out.ok ? [] : out.problems,
      host: out.ok ? new URL(out.url).host : null,
    },
    inbound: inn,
    counts: {
      pending: count("PENDING") + count("SENDING"),
      failed: count("FAILED") - dead,
      sent: count("SENT"),
      needsAttention: dead,
    },
    lastDeliveredAt: lastOk?.sentAt ?? null,
    lastFailure: lastFail,
    oldestWaitingAt: oldest?.createdAt ?? null,
  };
}
