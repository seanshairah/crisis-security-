import { requireUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { GateInventory } from "@/components/gate-inventory";
import { integrationStatus } from "@/lib/gate/status";
export default async function GateInventoryPage() {
  const user = await requireUser();
  const sites = await db.location.findMany({
    where: user.role === "SUPERVISOR" ? { supervisorId: user.id } : {},
    select: { id: true, name: true, gatePolicy: true },
    orderBy: { name: "asc" },
  });
  const items = await db.gateMovement.findMany({
    where: { locationId: { in: sites.map((s) => s.id) } },
    include: {
      location: { select: { name: true } },
      deliveries: {
        select: { status: true, lastError: true, deadAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <GateInventory
      sites={sites.map((s) => ({
        id: s.id,
        name: s.name,
        guardCanApprove: s.gatePolicy?.guardCanApprove ?? false,
      }))}
      items={JSON.parse(JSON.stringify(items))}
      admin={user.role !== "SUPERVISOR"}
      connection={
        user.role !== "SUPERVISOR"
          ? JSON.parse(JSON.stringify(await integrationStatus()))
          : undefined
      }
    />
  );
}
