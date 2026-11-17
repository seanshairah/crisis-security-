import { startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import { ON_SITE_STATUSES } from "@/lib/services/shifts";
import type { SummaryTile } from "@/components/ui/page";

/** The four figures shown above each list page. Plain counts, each one something an operator would act on. */

export async function guardsSummary(): Promise<SummaryTile[]> {
  const [active, onDuty, away, watched] = await Promise.all([
    db.guard.count({ where: { active: true } }),
    db.shift
      .groupBy({ by: ["guardId"], where: { status: { in: ON_SITE_STATUSES } } })
      .then((r) => r.length),
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
    db.shift.count({
      where: { startAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
    }),
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
    db.incident.count({
      where: { category: "EMERGENCY", status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    }),
    db.incident.count({
      where: { status: { in: ["RESOLVED", "CLOSED"] }, occurredAt: { gte: week } },
    }),
    db.incident.count({ where: { occurredAt: { gte: subDays(new Date(), 30) } } }),
  ]);
  return [
    { label: "Open", value: open, tone: open > 0 ? "warn" : "neutral" },
    {
      label: "Open emergencies",
      value: emergencies,
      tone: emergencies > 0 ? "critical" : "neutral",
    },
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

export function devicesSummary(
  rows: { status: string; activationStatus: string }[],
): SummaryTile[] {
  const online = rows.filter((r) => r.status === "ONLINE").length;
  const offline = rows.filter(
    (r) => r.status === "OFFLINE" && r.activationStatus === "ACTIVE",
  ).length;
  const pending = rows.filter((r) => r.activationStatus !== "ACTIVE").length;
  return [
    { label: "Phones", value: rows.length },
    { label: "Online", value: online, tone: online > 0 ? "ok" : "neutral" },
    { label: "Offline", value: offline, tone: offline > 0 ? "warn" : "neutral" },
    { label: "Waiting to activate", value: pending, note: "Activation code issued" },
  ];
}

export async function clientsSummary(): Promise<SummaryTile[]> {
  const [active, sites, guarded, inactive] = await Promise.all([
    db.client.count({ where: { active: true } }),
    db.location.count({ where: { active: true } }),
    db.shift
      .groupBy({ by: ["locationId"], where: { status: { in: ON_SITE_STATUSES } } })
      .then((r) => r.length),
    db.client.count({ where: { active: false } }),
  ]);
  return [
    { label: "Active clients", value: active },
    { label: "Sites under contract", value: sites },
    { label: "Sites with a guard on post", value: guarded, tone: guarded > 0 ? "ok" : "neutral" },
    { label: "Inactive clients", value: inactive },
  ];
}

export async function locationsSummary(): Promise<SummaryTile[]> {
  const [active, guarded, withoutFence, inactive] = await Promise.all([
    db.location.count({ where: { active: true } }),
    db.shift
      .groupBy({ by: ["locationId"], where: { status: { in: ON_SITE_STATUSES } } })
      .then((r) => r.length),
    db.location.count({ where: { active: true, OR: [{ latitude: null }, { longitude: null }] } }),
    db.location.count({ where: { active: false } }),
  ]);
  return [
    { label: "Active sites", value: active },
    { label: "With a guard on post", value: guarded, tone: guarded > 0 ? "ok" : "neutral" },
    {
      label: "No position set",
      value: withoutFence,
      tone: withoutFence > 0 ? "warn" : "neutral",
      note: "Arrival cannot be checked by GPS",
    },
    { label: "Inactive sites", value: inactive },
  ];
}

export async function usersSummary(): Promise<SummaryTile[]> {
  const [active, admins, supervisors, inactive] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.user.count({ where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN"] } } }),
    db.user.count({ where: { active: true, role: "SUPERVISOR" } }),
    db.user.count({ where: { active: false } }),
  ]);
  return [
    { label: "Active users", value: active },
    { label: "Admins", value: admins },
    { label: "Supervisors", value: supervisors },
    { label: "Deactivated", value: inactive, tone: inactive > 0 ? "warn" : "neutral" },
  ];
}

export async function messagesSummary(): Promise<SummaryTile[]> {
  const day = subDays(new Date(), 1);
  const [out, inbound, failed, queued] = await Promise.all([
    db.smsMessage.count({ where: { direction: "OUTBOUND", createdAt: { gte: day } } }),
    db.smsMessage.count({ where: { direction: "INBOUND", createdAt: { gte: day } } }),
    db.smsMessage.count({ where: { status: "FAILED", createdAt: { gte: day } } }),
    db.smsMessage.count({ where: { status: "QUEUED" } }),
  ]);
  return [
    { label: "Sent, last 24 hours", value: out },
    { label: "Replies, last 24 hours", value: inbound },
    { label: "Failed", value: failed, tone: failed > 0 ? "critical" : "neutral" },
    { label: "Waiting to send", value: queued, tone: queued > 0 ? "warn" : "neutral" },
  ];
}

export function callsSummary(m: { total: number; missed: number; unknown: number }): SummaryTile[] {
  const answered = Math.max(0, m.total - m.missed);
  return [
    { label: "Calls, last 30 days", value: m.total },
    { label: "Answered", value: answered, tone: "ok" },
    { label: "Missed", value: m.missed, tone: m.missed > 0 ? "warn" : "neutral" },
    { label: "From unknown numbers", value: m.unknown, tone: m.unknown > 0 ? "warn" : "neutral" },
  ];
}

export async function auditSummary(): Promise<SummaryTile[]> {
  const day = subDays(new Date(), 1);
  const [events, logins, failed, security] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gte: day } } }),
    db.auditLog.count({ where: { action: "USER_LOGIN", createdAt: { gte: day } } }),
    db.auditLog.count({
      where: { action: { in: ["LOGIN_FAILED", "LOGIN_THROTTLED"] }, createdAt: { gte: day } },
    }),
    db.auditLog.count({
      where: {
        action: { in: ["SMS_WEBHOOK_REJECTED", "VOICE_WEBHOOK_REJECTED"] },
        createdAt: { gte: day },
      },
    }),
  ]);
  return [
    { label: "Events, last 24 hours", value: events },
    { label: "Sign-ins", value: logins },
    {
      label: "Failed or throttled sign-ins",
      value: failed,
      tone: failed > 9 ? "critical" : failed > 0 ? "warn" : "neutral",
    },
    {
      label: "Rejected webhooks",
      value: security,
      tone: security > 0 ? "warn" : "neutral",
      note: "Unsigned or wrong-secret calls",
    },
  ];
}

export async function templatesSummary(): Promise<SummaryTile[]> {
  const [total, active, sentToday, failed] = await Promise.all([
    db.messageTemplate.count(),
    db.messageTemplate.count({ where: { active: true } }),
    db.smsMessage.count({
      where: { direction: "OUTBOUND", createdAt: { gte: startOfDay(new Date()) } },
    }),
    db.smsMessage.count({
      where: {
        direction: "OUTBOUND",
        status: "FAILED",
        createdAt: { gte: subDays(new Date(), 1) },
      },
    }),
  ]);
  return [
    { label: "Templates", value: total },
    { label: "In use", value: active, tone: "ok" },
    { label: "Messages sent today", value: sentToday },
    { label: "Failed, last 24 hours", value: failed, tone: failed > 0 ? "critical" : "neutral" },
  ];
}
