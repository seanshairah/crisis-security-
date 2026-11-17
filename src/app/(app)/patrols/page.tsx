import Link from "next/link";
import { requireUser, can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { patrolOverview } from "@/lib/patrol/overview";
import { SitePatrolSetup } from "@/components/patrols/site-patrol-setup";
import { PatrolProvision } from "@/components/patrols/provision";
import { fmtTime, fmtShort } from "@/lib/time";
export const metadata = { title: "Patrol Command | Crisis Security" };
export default async function PatrolPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const user = await requireUser();
  const { siteId } = await searchParams;
  const [o, sites, guards, devices, sessions, events] = await Promise.all([
    patrolOverview(siteId),
    db.location.findMany({
      where: { active: true },
      include: {
        patrolPolicy: true,
        _count: { select: { checkpoints: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    db.guard.findMany({ where: { active: true }, orderBy: { guardNo: "asc" } }),
    db.gatewayDevice.findMany({
      where: { guardId: null, status: { notIn: ["REVOKED", "DISABLED"] } },
    }),
    db.patrolSession.findMany({
      where: {
        endedAt: null,
        expiresAt: { gt: new Date() },
        ...(siteId ? { shift: { locationId: siteId } } : {}),
      },
      include: { device: true, shift: { include: { guard: true, location: true } } },
    }),
    db.patrolEvent.findMany({
      where: { ...(siteId ? { session: { shift: { locationId: siteId } } } : {}) },
      include: {
        assignment: { include: { checkpoint: true } },
        session: { include: { shift: { include: { guard: true } } } },
      },
      orderBy: { receivedAt: "desc" },
      take: 15,
    }),
  ]);
  const selected = sites.find((s) => s.id === siteId);
  return (
    <div className="space-y-5">
      <section className="crisis-command rounded-2xl border border-line p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-ink-3">
              Crisis / field intelligence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Patrol command<span className="text-accent-bright">.</span>
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              Every site. Every checkpoint. One operational picture.
            </p>
          </div>
          <a
            href={`/api/patrols/report${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm"
          >
            Export 30-day report ↗
          </a>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Verified patrols", o.completed, "QR + GPS evidence"],
            ["Windows needing review", o.missed, "May include offline devices"],
            ["In progress", o.active, "Response windows open"],
            ["Guard sessions", sessions.length, "Individual identities / shared devices"],
          ].map(([label, value, detail]) => (
            <div key={label} className="border-l border-line-strong pl-4">
              <p className="text-xs text-ink-2">{label}</p>
              <p className="my-2 text-4xl font-medium tabular-nums">{value}</p>
              <p className="text-[11px] text-ink-3">{detail}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Link className={`crisis-chip ${!siteId ? "selected" : ""}`} href="/patrols">
          All sites
        </Link>
        {sites.map((s) => (
          <Link
            key={s.id}
            className={`crisis-chip ${siteId === s.id ? "selected" : ""}`}
            href={`/patrols?siteId=${s.id}`}
          >
            {s.name} <span className="text-ink-3">{s._count.checkpoints}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex justify-between">
            <h2 className="font-semibold">Patrol signal</h2>
            <span className="text-xs text-ink-3">Last 24 hours · 2-hour intervals</span>
          </div>
          <div
            className="mt-6 flex h-32 items-end gap-2"
            role="img"
            aria-label={`${o.completed} verified of ${o.due} issued windows in the last 24 hours`}
          >
            {o.hours.map((h) => (
              <div
                key={h.at}
                className="group relative flex h-full flex-1 items-end"
                title={`${fmtTime(new Date(h.at))}: ${h.completed} verified of ${h.issued}`}
              >
                <div
                  className="w-full rounded-t bg-surface-2"
                  style={{
                    height: `${Math.max(3, (h.issued / Math.max(1, ...o.hours.map((b) => b.issued))) * 100)}%`,
                  }}
                >
                  <div
                    className="mt-auto h-full rounded-t border-t-2 border-accent-bright bg-accent/40"
                    style={{ height: `${h.issued ? (h.completed / h.issued) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-ink-3">
            <span>24h ago</span>
            <span>
              ■ Issued <span className="ml-3 text-accent-bright">■ Verified</span>
            </span>
            <span>Now</span>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Verification coverage</h2>
          <p className="mt-4 text-5xl font-medium">{o.rate === null ? "—" : `${o.rate}%`}</p>
          <p className="mt-3 text-sm text-ink-2">
            {o.completed} of {o.due} due patrol windows verified
          </p>
          <div className="my-4 h-2 overflow-hidden rounded bg-surface-2">
            <div className="h-full bg-accent-bright" style={{ width: `${o.rate ?? 0}%` }} />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            A QR scan counts only inside its issued window with an acceptable GPS fix. Delayed
            uploads remain identifiable. Attendance keeps its own verification policy.
          </p>
        </section>
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <h2 className="p-5 font-semibold">Operational queue</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-ink-3">
              <tr>
                {["Checkpoint / site", "Guard / handset", "Window", "Evidence", "Shift"].map(
                  (s) => (
                    <th className="px-5 py-3" key={s}>
                      {s}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {o.rows
                .filter((a) => a.dueAt <= new Date(Date.now() + 3600000))
                .slice(-40)
                .reverse()
                .map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <strong>{a.checkpoint.name}</strong>
                      <p className="text-xs text-ink-3">{a.session.shift.location.name}</p>
                    </td>
                    <td className="px-5 py-3">
                      {a.session.shift.guard.firstName} {a.session.shift.guard.lastName}
                      <p className="text-xs text-ink-3">{a.session.device.deviceName}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs">
                      {fmtShort(a.dueAt)}
                      <p className="text-ink-3">until {fmtTime(a.expiresAt)}</p>
                    </td>
                    <td
                      className={`px-5 py-3 text-xs ${a.status === "COMPLETED" ? "text-ok" : a.expiresAt < new Date() ? "text-warn" : "text-ink-2"}`}
                    >
                      {a.status === "COMPLETED"
                        ? "Verified"
                        : a.expiresAt < new Date()
                          ? "Awaiting evidence"
                          : a.dueAt > new Date()
                            ? "Scheduled"
                            : "Due now"}
                    </td>
                    <td className="px-5 py-3">
                      <Link className="underline" href={`/shifts/${a.session.shiftId}`}>
                        Open ↗
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!o.rows.length && (
          <p className="px-5 pb-6 text-sm text-ink-3">
            No issued patrols. Configure a site, assign a handset, then sign in a scheduled guard on
            Android.
          </p>
        )}
      </section>
      {selected && (
        <SitePatrolSetup
          siteId={selected.id}
          editable={can.manageLocations(user)}
          latitude={selected.latitude}
          longitude={selected.longitude}
        />
      )}
      {!selected && (
        <section className="grid gap-3 md:grid-cols-3">
          {sites.map((s) => (
            <Link
              href={`/patrols?siteId=${s.id}`}
              key={s.id}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <h3 className="font-medium">{s.name} ↗</h3>
              <p className="mt-2 text-xs text-ink-3">
                {s._count.checkpoints} checkpoints ·{" "}
                {s.patrolPolicy?.enabled ? "Patrols enabled" : "Configure patrol route"}
              </p>
            </Link>
          ))}
        </section>
      )}
      {can.manageLocations(user) && (
        <PatrolProvision
          guards={guards.map((g) => ({
            id: g.id,
            name: `${g.guardNo} · ${g.firstName} ${g.lastName}`,
          }))}
          devices={devices.map((d) => ({ id: d.id, name: d.deviceName }))}
          sites={sites}
        />
      )}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Evidence stream</h2>
        {events.map((e) => (
          <div
            className="flex flex-wrap justify-between gap-2 border-t border-line py-3 text-xs"
            key={e.eventId}
          >
            <span>
              {e.session.shift.guard.guardNo} / {e.assignment.checkpoint.name}
            </span>
            <span className={e.decision === "ACCEPTED" ? "text-ok" : "text-warn"}>
              {e.decision.replaceAll("_", " ")} {e.delayed ? "· delayed upload" : ""}
            </span>
            <span className="text-ink-3">
              Captured {fmtShort(e.capturedAt)} · received {fmtTime(e.receivedAt)}
            </span>
          </div>
        ))}
        {!events.length && (
          <p className="text-sm text-ink-3">
            Device evidence will appear here after the first scan.
          </p>
        )}
      </section>
    </div>
  );
}
