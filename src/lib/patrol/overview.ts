import { db } from "@/lib/db";
export async function patrolOverview(siteId?: string) {
  const now = new Date();
  const rows = await db.patrolAssignment.findMany({
    where: {
      dueAt: { gte: new Date(+now - 86400000), lte: new Date(+now + 86400000) },
      ...(siteId ? { session: { shift: { locationId: siteId } } } : {}),
    },
    include: {
      checkpoint: true,
      session: { include: { device: true, shift: { include: { guard: true, location: true } } } },
    },
    orderBy: { dueAt: "asc" },
    take: 5000,
  });
  const relevant = rows.filter(
    (a) =>
      (!a.session.endedAt || a.expiresAt < a.session.endedAt) &&
      a.session.shift.status !== "CANCELLED",
  );
  const due = relevant.filter((a) => a.dueAt <= now);
  const completed = due.filter((a) => a.status === "COMPLETED").length;
  const missed = due.filter((a) => a.status !== "COMPLETED" && a.expiresAt < now).length;
  const active = due.filter((a) => a.status === "PENDING" && a.expiresAt >= now).length;
  const hours = Array.from({ length: 12 }, (_, i) => {
    const end = +now - (11 - i) * 7200000;
    const start = end - 7200000;
    const bucket = due.filter((a) => +a.dueAt > start && +a.dueAt <= end);
    return {
      at: new Date(end).toISOString(),
      issued: bucket.length,
      completed: bucket.filter((a) => a.status === "COMPLETED").length,
    };
  });
  return {
    rows: relevant,
    completed,
    missed,
    active,
    due: due.length,
    rate: due.length ? Math.round((completed / due.length) * 100) : null,
    hours,
  };
}
