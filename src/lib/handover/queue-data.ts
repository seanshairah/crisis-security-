import { db } from "@/lib/db";
import { alertInclude } from "@/lib/gateway/alerts";
import { effectiveStatus } from "@/lib/gateway/service";
import { getSettingNumber } from "@/lib/settings";
import { needsAttention } from "@/lib/services/dashboard";
import { buildQueue } from "@/lib/dashboard/queue";
import { currentClaims } from "./service";

/** The same ranked list the dashboard shows, loaded on its own for the handover view and its actions. */
export async function loadQueue(limit = 6) {
  const [alerts, shifts, gateways, offlineMinutes, claims] = await Promise.all([
    db.guardAlert.findMany({
      where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      include: alertInclude,
      orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
      take: 50,
    }),
    needsAttention(),
    db.gatewayDevice.findMany({
      where: { status: { notIn: ["REVOKED"] } },
      select: {
        id: true,
        deviceName: true,
        status: true,
        lastSeenAt: true,
        activationStatus: true,
      },
    }),
    getSettingNumber("gateway.offlineMinutes"),
    currentClaims(),
  ]);
  return buildQueue({
    alerts,
    shifts,
    claims,
    limit,
    devices: gateways
      .filter(
        (g) => g.activationStatus === "ACTIVE" && effectiveStatus(g, offlineMinutes) === "OFFLINE",
      )
      .map((g) => ({ id: g.id, deviceName: g.deviceName, lastSeenAt: g.lastSeenAt })),
  });
}
