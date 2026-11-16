/**
 * "Needs you now": one ranked list of everything an operator should act on, merged from the three
 * places the portal already tracks it: guard alerts from phones, shifts in a bad state, and
 * gateway phones that have gone quiet. Pure, so the ordering is testable without a database.
 */
export type QueueTone = "critical" | "warn";
export type QueueOwner = { state: "handled" | "unassigned"; label: string };
export type QueueItem = {
  id: string;
  /** Claimable key for shift and device rows; null for alerts, which are owned through acknowledgement. */
  claimKey: string | null;
  kind: "alert" | "shift" | "device";
  tone: QueueTone;
  icon:
    | "emergency"
    | "medical_services"
    | "report"
    | "person_off"
    | "timer"
    | "cloud_off"
    | "support_agent"
    | "location_off";
  title: string;
  detail: string;
  owner: QueueOwner | null;
  href: string;
  phone: string | null;
  rank: number;
  at: number;
};

export type QueueAlert = {
  id: string;
  type: string;
  status: string;
  message: string | null;
  occurredAt: Date;
  guard: { firstName: string; lastName: string; phone: string | null };
  location: { name: string } | null;
  acknowledgedBy: { name: string } | null;
};
export type QueueShift = {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date;
  guard: { firstName: string; lastName: string; phone: string | null };
  location: { name: string };
  attendance: { arrivalConfirmedAt: Date | null } | null;
};
export type QueueDevice = {
  id: string;
  deviceName: string;
  lastSeenAt: Date | null;
  queued?: number;
};

const ALERT_ICON: Record<string, QueueItem["icon"]> = {
  EMERGENCY: "emergency",
  NEED_ASSISTANCE: "medical_services",
  INCIDENT_REPORT: "report",
  SECURITY_ALERT: "report",
  RUNNING_LATE: "timer",
};
const ALERT_RANK: Record<string, number> = {
  EMERGENCY: 0,
  SECURITY_ALERT: 2,
  INCIDENT_REPORT: 2,
  NEED_ASSISTANCE: 3,
  RUNNING_LATE: 6,
};
const ALERT_WORD: Record<string, string> = {
  EMERGENCY: "Emergency",
  NEED_ASSISTANCE: "Needs assistance",
  INCIDENT_REPORT: "Incident reported",
  SECURITY_ALERT: "Security alert",
  RUNNING_LATE: "Running late",
};
const SHIFT_RANK: Record<string, number> = {
  CRITICAL: 1,
  INCIDENT: 4,
  ASSISTANCE: 4,
  NOT_CONFIRMED: 5,
  LATE: 7,
};
const SHIFT_WORD: Record<string, string> = {
  CRITICAL: "Emergency",
  INCIDENT: "Incident on shift",
  ASSISTANCE: "Asking for assistance",
  NOT_CONFIRMED: "Arrival not confirmed",
  LATE: "Running late",
};

const name = (g: { firstName: string; lastName: string }) => `${g.firstName} ${g.lastName}`;
const mins = (from: Date, now: Date) => Math.max(0, Math.round((+now - +from) / 60000));
const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** itemKey ("shift:<id>", "device:<id>") to the name of the operator who has claimed it. */
export type QueueClaims = Record<string, string>;

export function buildQueue(input: {
  alerts: QueueAlert[];
  shifts: QueueShift[];
  devices: QueueDevice[];
  claims?: QueueClaims;
  now?: Date;
  limit?: number;
}): QueueItem[] {
  const now = input.now ?? new Date();
  const items: QueueItem[] = [];
  const claims = input.claims ?? {};
  const ownerOf = (key: string): QueueOwner =>
    claims[key]
      ? { state: "handled", label: `Handling: ${claims[key]}` }
      : { state: "unassigned", label: "Unassigned" };
  const alertedShiftGuards = new Set<string>();

  for (const a of input.alerts) {
    if (!(a.type in ALERT_RANK)) continue; // informational alerts (shift going well, status updates) never need an operator
    alertedShiftGuards.add(name(a.guard));
    const handled = a.status === "ACKNOWLEDGED" || !!a.acknowledgedBy;
    items.push({
      id: `alert:${a.id}`,
      claimKey: null,
      kind: "alert",
      tone: a.type === "RUNNING_LATE" || a.type === "NEED_ASSISTANCE" ? "warn" : "critical",
      icon: ALERT_ICON[a.type] ?? "report",
      title: `${ALERT_WORD[a.type] ?? "Alert"} · ${name(a.guard)}`,
      detail: [
        a.location?.name,
        `sent ${mins(a.occurredAt, now)} min ago`,
        a.message ? `“${a.message}”` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      owner: handled
        ? { state: "handled", label: `Handling: ${a.acknowledgedBy?.name ?? "acknowledged"}` }
        : {
            state: "unassigned",
            label: a.type === "EMERGENCY" ? "Nobody has acknowledged it" : "Unassigned",
          },
      href: `/alerts?focus=${a.id}`,
      phone: a.guard.phone,
      // An acknowledged alert is being handled: it stays visible, but below anything nobody owns yet.
      rank: (ALERT_RANK[a.type] ?? 5) + (handled ? 10 : 0),
      at: +a.occurredAt,
    });
  }
  for (const s of input.shifts) {
    if (!(s.status in SHIFT_RANK)) continue;
    // The alert row already says it; do not list the same emergency twice.
    if (
      ["CRITICAL", "ASSISTANCE", "INCIDENT"].includes(s.status) &&
      alertedShiftGuards.has(name(s.guard))
    )
      continue;
    items.push({
      id: `shift:${s.id}`,
      claimKey: `shift:${s.id}`,
      kind: "shift",
      tone:
        s.status === "LATE" || s.status === "NOT_CONFIRMED" || s.status === "ASSISTANCE"
          ? "warn"
          : "critical",
      icon:
        s.status === "NOT_CONFIRMED"
          ? "person_off"
          : s.status === "LATE"
            ? "timer"
            : s.status === "ASSISTANCE"
              ? "medical_services"
              : "report",
      title: `${SHIFT_WORD[s.status]} · ${name(s.guard)}`,
      detail: `${s.location.name} · ${hhmm(s.startAt)}–${hhmm(s.endAt)} · ${s.attendance?.arrivalConfirmedAt ? `arrived ${hhmm(s.attendance.arrivalConfirmedAt)}` : "arrival not confirmed"}`,
      owner: ownerOf(`shift:${s.id}`),
      href: `/shifts/${s.id}`,
      phone: s.guard.phone,
      rank: SHIFT_RANK[s.status] + (claims[`shift:${s.id}`] ? 10 : 0),
      at: +s.startAt,
    });
  }
  for (const d of input.devices) {
    // A phone that has never connected is a setup task (Devices page), not something to act on now.
    if (!d.lastSeenAt) continue;
    items.push({
      id: `device:${d.id}`,
      claimKey: `device:${d.id}`,
      kind: "device",
      tone: "warn",
      icon: "cloud_off",
      title: `${d.deviceName} phone offline`,
      detail: `Last heard from ${mins(d.lastSeenAt, now)} min ago${d.queued ? ` · ${d.queued} events saved on the phone` : ""}`,
      owner: ownerOf(`device:${d.id}`),
      href: `/gateways/${d.id}`,
      phone: null,
      rank: 8 + (claims[`device:${d.id}`] ? 10 : 0),
      at: +d.lastSeenAt,
    });
  }
  return items.sort((x, y) => x.rank - y.rank || y.at - x.at).slice(0, input.limit ?? 6);
}
