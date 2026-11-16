import { guarded } from '@/lib/api';
import { db } from '@/lib/db';
export const GET = guarded('SUPERVISOR', async req => {
  const url = new URL(req.url); const siteId = url.searchParams.get('siteId');
  const rows = await db.patrolAssignment.findMany({ where: { dueAt: { gte: new Date(Date.now() - 30 * 86400000) }, ...(siteId ? { session: { shift: { locationId: siteId } } } : {}) }, include: { checkpoint: true, session: { include: { shift: { include: { guard: true, location: true } }, device: true } } }, orderBy: { dueAt: 'desc' }, take: 10000 });
  const cell = (s: unknown) => { let v = String(s ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replaceAll('"', '""') + '"'; };
  const csv = [['Site', 'Guard', 'Device', 'Shift', 'Checkpoint', 'Due UTC', 'Expires UTC', 'Result', 'Captured UTC'], ...rows.map(a => [a.session.shift.location.name, a.session.shift.guard.guardNo, a.session.device.deviceName, a.session.shiftId, a.checkpoint.name, a.dueAt.toISOString(), a.expiresAt.toISOString(), a.session.endedAt && a.expiresAt >= a.session.endedAt ? 'SESSION_ENDED' : a.status, a.completedAt?.toISOString()])].map(row => row.map(cell).join(',')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="crisis-patrols-30-days.csv"', 'Cache-Control': 'no-store' } });
});
