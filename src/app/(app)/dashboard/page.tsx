import { patrolOverview } from "@/lib/patrol/overview";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser, can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  todayOverview,
  dailySeries,
  activityTrend,
  attendanceRate,
  needsAttention,
} from "@/lib/services/dashboard";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { Gauge } from "@/components/dashboard/gauge";
import { SendMessage } from "@/components/dashboard/send-message";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { NeedsYouNow } from "@/components/dashboard/needs-you-now";
import { buildQueue } from "@/lib/dashboard/queue";
import { currentClaims } from "@/lib/handover/service";
import { STATUS_META, ON_SITE_STATUSES } from "@/lib/services/shifts";
import { subDays } from "date-fns";
import { liveCalls, callInclude } from "@/lib/gateway/calls";
import { LiveCallCards } from "@/components/calls/live-calls";
import { getSettingNumber } from "@/lib/settings";
import { effectiveStatus } from "@/lib/gateway/service";
import { cn } from "@/lib/cn";
import { alertInclude } from "@/lib/gateway/alerts";

export const metadata = { title: "Overview" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = (["12h", "24h", "7d"].includes(sp.range ?? "") ? sp.range : "12h") as
    "12h" | "24h" | "7d";
  const [
    o,
    series,
    trend,
    rate,
    attention,
    onDutyGuards,
    live,
    missedCalls,
    gateways,
    offlineMinutes,
  ] = await Promise.all([
    todayOverview(),
    dailySeries(),
    activityTrend(range),
    attendanceRate(),
    needsAttention(),
    db.shift.findMany({
      where: { status: { in: [...ON_SITE_STATUSES, "LATE", "NOT_CONFIRMED", "AWAITING_ARRIVAL"] } },
      include: { guard: true },
      orderBy: { guard: { lastName: "asc" } },
    }),
    liveCalls(),
    db.callLog.findMany({
      where: {
        status: "MISSED",
        direction: "INCOMING",
        note: null,
        guardId: { not: null },
        startedAt: { gte: subDays(new Date(), 1) },
      },
      include: callInclude,
      orderBy: { startedAt: "desc" },
      take: 6,
    }),
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
  ]);
  const patrol = await patrolOverview();
  const openAlerts = await db.guardAlert.findMany({
    where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    include: alertInclude,
    orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
    take: 12,
  });
  const gatewayOnline = gateways.filter(
    (g) => effectiveStatus(g, offlineMinutes) === "ONLINE",
  ).length;
  const showCalls = gateways.length > 0 || live.length > 0 || missedCalls.length > 0;
  const posture =
    rate.pct >= 85
      ? { word: "Strong", tone: "ok" as const, line: "Guards are reporting for duty on time." }
      : rate.pct >= 60
        ? {
            word: "Watch",
            tone: "warn" as const,
            line: "Several guards have not confirmed arrival.",
          }
        : {
            word: "Weak",
            tone: "critical" as const,
            line: "Attendance is well below target. Call the sites.",
          };

  const queue = buildQueue({
    alerts: openAlerts,
    shifts: attention,
    claims: await currentClaims(),
    devices: gateways
      .filter(
        (g) => g.activationStatus === "ACTIVE" && effectiveStatus(g, offlineMinutes) === "OFFLINE",
      )
      .map((g) => ({ id: g.id, deviceName: g.deviceName, lastSeenAt: g.lastSeenAt })),
  });
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: process.env.TIMEZONE || "Africa/Harare",
    }).format(new Date()),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const sites = await db.location.count({ where: { active: true } });
  const patrolTone = patrol.missed > 0 ? "warn" : patrol.due === 0 ? "neutral" : "ok";

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-none text-ink sm:text-[44px]">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {queue.length === 0
              ? "Nothing needs you"
              : `${queue.length} thing${queue.length === 1 ? "" : "s"} need${queue.length === 1 ? "s" : ""} you`}{" "}
            · {o.onDuty} guard{o.onDuty === 1 ? "" : "s"} on duty · {sites} site
            {sites === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.manageLocations(user) && (
            <Link href="/setup" className={buttonClass("primary")}>
              <Icon name="assignment" size={18} filled />
              Guided setup
            </Link>
          )}
          <Link href="/handover" className={buttonClass("secondary")}>
            <Icon name="swap_horiz" size={18} filled />
            Shift handover
          </Link>
          <Link href="/patrols" className={buttonClass("secondary")}>
            <Icon name="route" size={18} filled />
            Patrol command
          </Link>
        </div>
      </header>

      <NeedsYouNow items={queue} calm={{ guards: o.onDuty, patrolsVerified: patrol.completed }} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Guards on duty"
          value={o.onDuty}
          of={`of ${o.scheduledToday} scheduled`}
          note={
            o.scheduledToday > o.onDuty
              ? `${o.scheduledToday - o.onDuty} not yet on post`
              : "Everyone scheduled is on post"
          }
          icon="schedule"
          tone={o.scheduledToday > o.onDuty ? "warn" : "ok"}
          series={series.onDuty}
        />
        <KpiCard
          title="Patrols verified"
          value={patrol.completed}
          of={`/ ${patrol.due} due`}
          note={
            patrol.missed > 0
              ? `${patrol.missed} awaiting evidence`
              : `${patrol.active} window${patrol.active === 1 ? "" : "s"} open now`
          }
          icon={patrol.missed > 0 ? "error" : "check_circle"}
          tone={patrolTone}
        />
        <KpiCard
          title="Not reported"
          value={o.notReported}
          note="Arrival not confirmed after escalation"
          icon="error"
          tone={o.notReported > 0 ? "critical" : "neutral"}
          series={series.notReported}
        />
        <KpiCard
          title="Open incidents"
          value={o.incidents}
          note={`${o.assistance} assistance request${o.assistance === 1 ? "" : "s"}`}
          icon="support_agent"
          tone="neutral"
          series={series.incidents}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Operations activity"
            description="Automated checks sent, replies received and confirmations, by hour."
            action={
              <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
                {(["12h", "24h", "7d"] as const).map((r) => (
                  <Link
                    key={r}
                    href={`/dashboard?range=${r}`}
                    className={cn(
                      "h-8 rounded-full px-3 text-[12.5px] font-medium leading-8",
                      range === r ? "bg-surface text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {r === "7d" ? "Last 7 days" : `Last ${r.replace("h", " hours")}`}
                  </Link>
                ))}
              </div>
            }
          />
          <CardBody>
            <TrendChart data={trend} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Attendance"
            description="Shifts started in the last 24 hours with arrival confirmed."
          />
          <CardBody className="flex flex-col items-center">
            <Gauge value={rate.pct} />
            <p className="mt-3 text-center text-[13px] text-ink-2">
              {posture.line} {rate.arrived} of {rate.started} arrived, {rate.onTime} on time.
            </p>
            <p
              className={cn(
                "mt-1 text-[13px] font-medium tnum",
                rate.delta > 0 ? "text-ok" : rate.delta < 0 ? "text-critical" : "text-ink-3",
              )}
            >
              {rate.delta > 0 ? "↑" : rate.delta < 0 ? "↓" : ""} {Math.abs(rate.delta)} pts{" "}
              <span className="font-normal text-ink-3">vs last 7 days</span>
            </p>
          </CardBody>
        </Card>
      </div>

      {showCalls && (
        <Card className={missedCalls.some((c) => c.shiftId) ? "border-critical" : ""}>
          <CardHeader
            title={missedCalls.some((c) => c.shiftId) ? "Active guard missed call" : "Calls"}
            description={`${gatewayOnline} of ${gateways.length} gateway phone${gateways.length === 1 ? "" : "s"} online. Ringing and in-progress calls, then missed calls from the last 24 hours that nobody has handled.`}
            action={
              <Link
                href="/calls"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline"
              >
                All calls <Icon name="chevron_right" size={12} filled />
              </Link>
            }
          />
          <CardBody className="pt-3">
            <LiveCallCards live={live} missed={missedCalls} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Message guards"
          description={`Signed as ${user.name}`}
          action={
            <Link
              href="/messages/new"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline"
            >
              Compose · groups, WhatsApp, email <Icon name="chevron_right" size={12} filled />
            </Link>
          }
        />
        <CardBody>
          <SendMessage
            guards={onDutyGuards.map((s) => ({
              id: s.guardId,
              name: `${s.guard.firstName} ${s.guard.lastName}`,
              status: STATUS_META[s.status].label,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
