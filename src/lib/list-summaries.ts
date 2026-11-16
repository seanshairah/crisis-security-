import { startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import { ON_SITE_STATUSES } from "@/lib/services/shifts";
import type { SummaryTile } from "@/components/ui/page";

/** The four figures shown above each list page. Plain counts, each one something an operator would act on. */

export async function guardsSummary(): Promise<SummaryTile[]> {
  const [active, onDuty, away, watched] = await Promise.all([
    db.guard.count({ where: { active: true } }),
    db.shift.groupBy({ by: ["guardId"], where: { status: { in: ON_SITE_STATUSES } } }).then((r) => r.length),
    db.guard.count({ where: { employmentStatus: { in: ["ON_LEAVE", "SUSPENDED"] } } }),
    db.guard.count({ where: { watched: true } }),
  ]);
  return [
    { label: "Active guards", value: active },
    { label: "On post now", value: onDuty, tone: onDuty > 0 ? "ok" : "neutral" },
    { label: "On leave or suspended", value: away, tone: away > 0 ? "warn" : "neutral" },
    { label: "Being watched", value: watched, note: "Extra monitoring switched on" },
  ];
}

export async function shiftsSummary(): Promise<SummaryTile[]> {
  const today = startOfDay(new Date());
  const tomorrow = new Date(+today + 86400000);
  const [scheduled, onDuty, attention, completed] = await Promise.all([
    db.shift.count({ where: { startAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } } }),
    db.shift.count({ where: { status: { in: ON_SITE_STATUSES } } }),
    db.shift.count({ where: { status: { in: ["LATE", "NOT_CONFIRMED"] } } }),
    db.shift.count({ where: { status: "COMPLETED", endAt: { gte: today } } }),
  ]);
  return [
    { label: "Scheduled today", value: scheduled },
    { label: "On post", value: onDuty, tone: onDuty > 0 ? "ok" : "neutral" },
    { label: "Late or not confirmed", value: attention, tone: attention > 0 ? "warn" : "neutral" },
    { label: "Completed today", value: completed },
  ];
}

export async function incidentsSummary(): Promise<SummaryTile[]> {
  const week = subDays(new Date(), 7);
  const [open, emergencies, resolved, total] = await Promise.all([
    db.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    db.incident.count({ where: { category: "EMERGENCY", status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    db.incident.count({ where: { status: { in: ["RESOLVED", "CLOSED"] }, occurredAt: { gte: week } } }),
    db.incident.count({ where: { occurredAt: { gte: subDays(new Date(), 30) } } }),
  ]);
  return [
    { label: "Open", value: open, tone: open > 0 ? "warn" : "neutral" },
    { label: "Open emergencies", value: emergencies, tone: emergencies > 0 ? "critical" : "neutral" },
    { label: "Resolved, last 7 days", value: resolved, tone: "ok" },
    { label: "Reported, last 30 days", value: total },
  ];
}

export async function alertsSummary(): Promise<SummaryTile[]> {
  const day = subDays(new Date(), 1);
  const [open, acknowledged, resolved, total] = await Promise.all([
    db.guardAlert.count({ where: { status: "OPEN" } }),
    db.guardAlert.count({ where: { status: "ACKNOWLEDGED" } }),
    db.guardAlert.count({ where: { status: "RESOLVED", occurredAt: { gte: day } } }),
    db.guardAlert.count({ where: { occurredAt: { gte: day } } }),
  ]);
  return [
    { label: "Waiting for someone", value: open, tone: open > 0 ? "critical" : "neutral" },
    { label: "Being handled", value: acknowledged, tone: acknowledged > 0 ? "warn" : "neutral" },
    { label: "Resolved, last 24 hours", value: resolved, tone: "ok" },
    { label: "Received, last 24 hours", value: total },
  ];
}

export function devicesSummary(rows: { status: string; activationStatus: string }[]): SummaryTile[] {
  const online = rows.filter((r) => r.status === "ONLINE").length;
  const offline = rows.filter((r) => r.status === "OFFLINE" && r.activationStatus === "ACTIVE").length;
  const pending = rows.filter((r) => r.activationStatus !== "ACTIVE").length;
  return [
    { label: "Phones", value: rows.length },
    { label: "Online", value: online, tone: online > 0 ? "ok" : "neutral" },
    { label: "Offline", value: offline, tone: offline > 0 ? "warn" : "neutral" },
    { label: "Waiting to activate", value: pending, note: "Activation code issued" },
  ];
}
