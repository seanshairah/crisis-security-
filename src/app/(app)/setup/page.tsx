import { requireUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { AdminSetup } from "@/components/setup/admin-setup";
import { dateInputValue, timeInputValue } from "@/lib/time";
export const metadata = { title: "Guided setup | Crisis Security" };
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  await requireUser("ADMIN");
  const { siteId } = await searchParams;
  const [clients, sites, guards, devices, shifts] = await Promise.all([
    db.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      where: { active: true },
      include: {
        patrolPolicy: true,
        _count: { select: { checkpoints: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    db.guard.findMany({
      where: { active: true, employmentStatus: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardNo: true,
        patrolCredential: { select: { guardId: true } },
      },
      orderBy: { firstName: "asc" },
    }),
    db.gatewayDevice.findMany({
      where: { sharedCompanyDevice: true, status: { notIn: ["REVOKED", "DISABLED"] } },
      select: {
        id: true,
        deviceName: true,
        locationId: true,
        activationStatus: true,
        activationCode: true,
        activationExpiresAt: true,
        lastSeenAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.shift.findMany({
      where: { endAt: { gt: new Date() }, status: { notIn: ["CANCELLED", "COMPLETED", "MISSED"] } },
      select: { id: true, locationId: true, guardId: true, startAt: true, endAt: true },
      orderBy: { startAt: "asc" },
      take: 100,
    }),
  ]);
  const now = new Date();
  return (
    <AdminSetup
      clients={clients}
      sites={sites.map((s) => ({
        id: s.id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        checkpoints: s._count.checkpoints,
        patrolsEnabled: s.patrolPolicy?.enabled ?? false,
      }))}
      guards={guards.map((g) => ({
        id: g.id,
        name: `${g.firstName} ${g.lastName}`,
        guardNo: g.guardNo,
        hasPin: !!g.patrolCredential,
      }))}
      devices={devices.map((d) => ({
        ...d,
        activationExpiresAt: d.activationExpiresAt?.toISOString() ?? null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      }))}
      shifts={shifts.map((s) => ({
        ...s,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
      }))}
      initialSiteId={siteId}
      today={dateInputValue(now)}
      currentTime={timeInputValue(now)}
      localTest={
        process.env.CRISIS_LOCAL_TEST === "true" && process.env.APP_URL === "http://localhost:3139"
      }
    />
  );
}
