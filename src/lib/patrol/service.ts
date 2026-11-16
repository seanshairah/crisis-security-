import { verifyCoordinateQr } from './checkpoint-qr';
import { gpsTimeCorrelates } from './scan-time';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { classifyFix } from '@/lib/geofence';
import { hashGuardPin, verifyGuardPin, pinAttemptDecision } from './shared-device';
import { createPatrolPlan } from './plan';
import { scanSchema, type Scan } from './validation';

export const qrHash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(4).readUInt32BE();
export async function serial<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 20000 }); }
    catch (e) { if (i < 4 && e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(e.code)) continue; throw e; }
  }
}
export async function setPatrolPin(guardId: string, pin: string, actorId: string) {
  const pinHash = await hashGuardPin(pin);
  await serial(async tx => {
    await tx.patrolCredential.upsert({ where: { guardId }, create: { guardId, pinHash }, update: { pinHash, failures: 0, lastFailureAt: null, version: { increment: 1 } } });
    await tx.patrolSession.updateMany({ where: { shift: { guardId }, endedAt: null }, data: { endedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: actorId, actor: actorId, action: 'PATROL_PIN_CHANGED', entity: 'Guard', entityId: guardId } });
  });
}
const sessionInclude = { shift: { include: { guard: true, location: true } }, assignments: { include: { checkpoint: true }, orderBy: { dueAt: 'asc' as const } } };
export async function startPatrolSession(deviceId: string, guardNo: string, pin: string, now = new Date()) {
  const result = await serial(async tx => {
    // Same row locks serialize handovers and brute force counters across API instances.
    await tx.$queryRaw`SELECT id FROM "GatewayDevice" WHERE id = ${deviceId} FOR UPDATE`;
    const device = await tx.gatewayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    if (!device.sharedCompanyDevice || device.mode !== 'GUARD' || device.activationStatus !== 'ACTIVE' || ['REVOKED', 'DISABLED'].includes(device.status)) throw Error('Company guard device required');
    const guard = await tx.guard.findUnique({ where: { guardNo }, include: { patrolCredential: true } });
    const lock = await tx.patrolDeviceLock.upsert({ where: { deviceId }, create: { deviceId }, update: {} });
    const credential = guard?.patrolCredential;
    if (pinAttemptDecision(lock.failures, lock.lastFailureAt?.getTime() ?? 0, +now) === 'LOCKED' || (credential && pinAttemptDecision(credential.failures, credential.lastFailureAt?.getTime() ?? 0, +now) === 'LOCKED')) return { error: 'Sign-in locked for 15 minutes' };
    if (!guard?.active || guard.employmentStatus !== 'ACTIVE' || !credential || !(await verifyGuardPin(pin, credential.pinHash))) {
      await tx.patrolDeviceLock.update({ where: { deviceId }, data: { failures: lock.lastFailureAt && +now - +lock.lastFailureAt < 900000 ? { increment: 1 } : 1, lastFailureAt: now } });
      if (credential) await tx.patrolCredential.update({ where: { guardId: guard.id }, data: { failures: credential.lastFailureAt && +now - +credential.lastFailureAt < 900000 ? { increment: 1 } : 1, lastFailureAt: now } });
      return { error: 'Invalid guard number or PIN' };
    }
    const shifts = await tx.shift.findMany({ where: { guardId: guard.id, startAt: { lte: now }, endAt: { gt: now }, status: { notIn: ['CANCELLED', 'COMPLETED', 'MISSED'] }, ...(device.locationId ? { locationId: device.locationId } : {}) }, include: { location: { include: { patrolPolicy: true, checkpoints: { where: { active: true } } } } } });
    if (shifts.length !== 1) return { error: 'A single active shift at this device site is required' };
    const shift = shifts[0]; const policy = shift.location.patrolPolicy;
    if (!shift.location.active || !policy?.enabled || !shift.location.checkpoints.length) return { error: 'Site patrol policy and checkpoints must be enabled' };
    // Idempotent login resumes the same session; it never resets patrol deadlines.
    const existing = await tx.patrolSession.findFirst({ where: { deviceId, shiftId: shift.id, endedAt: null, expiresAt: { gt: now } } });
    await tx.patrolCredential.update({ where: { guardId: guard.id }, data: { failures: 0, lastFailureAt: null } });
    await tx.patrolDeviceLock.update({ where: { deviceId }, data: { failures: 0, lastFailureAt: null } });
    if (existing) return { sessionId: existing.id };
    await tx.deviceLocationRequest.updateMany({ where: { gatewayDeviceId: deviceId, status: { in: ['PENDING', 'DELIVERED', 'PROCESSING'] } }, data: { status: 'CANCELLED', completedAt: now } });
    await tx.patrolSession.updateMany({ where: { OR: [{ deviceId }, { shift: { guardId: guard.id } }], endedAt: null }, data: { endedAt: now } });
    const plan = createPatrolPlan(+now, +shift.endAt, policy, shift.location.checkpoints, random);
    await tx.gatewayDevice.update({ where: { id: deviceId }, data: { lastLatitude: null, lastLongitude: null, lastAccuracyM: null, lastLocationAt: null, lastLocationState: null, configVersionApplied: null } });
    const session = await tx.patrolSession.create({ data: { deviceId, shiftId: shift.id, startedAt: now, expiresAt: shift.endAt, policyVersion: policy.version, assignments: { create: plan } } });
    await tx.auditLog.create({ data: { actor: guard.guardNo, action: 'PATROL_SESSION_STARTED', entity: 'Shift', entityId: shift.id, details: { deviceId, sessionId: session.id } } });
    return { sessionId: session.id };
  });
  if ('error' in result) throw Error(result.error);
  return patrolConfig(deviceId);
}
export async function patrolConfig(deviceId: string) {
  const now = new Date();
  const session = await db.patrolSession.findFirst({ where: { deviceId, endedAt: null, expiresAt: { gt: now }, shift: { status: { notIn: ['CANCELLED', 'COMPLETED', 'MISSED'] }, guard: { active: true, employmentStatus: 'ACTIVE' }, location: { active: true } } }, include: sessionInclude });
  if (!session) return { session: null, serverTime: now.toISOString() };
  return { serverTime: now.toISOString(), session: { id: session.id, shiftId: session.shiftId, guardId: session.shift.guardId, guardName: `${session.shift.guard.firstName} ${session.shift.guard.lastName}`, siteId: session.shift.locationId, siteName: session.shift.location.name, startedAt: session.startedAt, expiresAt: session.expiresAt, policyVersion: session.policyVersion, assignments: session.assignments.map(a => ({ id: a.id, checkpointId: a.checkpointId, checkpointName: a.checkpoint.name, qrHash: a.checkpoint.qrHash, qrVersion: a.checkpoint.qrVersion, latitude: a.checkpoint.latitude, longitude: a.checkpoint.longitude, radiusM: a.checkpoint.radiusM, dueAt: a.dueAt, expiresAt: a.expiresAt, status: a.status })) } };
}
export async function endPatrolSession(deviceId: string, sessionId: string) {
  await serial(async tx => {
    const s = await tx.patrolSession.findFirst({ where: { id: sessionId, deviceId } });
    if (!s) throw Error('Session not found');
    if (!s.endedAt) {
      const endedAt = new Date();
      await tx.patrolSession.update({ where: { id: s.id }, data: { endedAt } });
      await tx.deviceLocationRequest.updateMany({ where: { gatewayDeviceId: deviceId, status: { in: ['PENDING', 'DELIVERED', 'PROCESSING'] } }, data: { status: 'CANCELLED', completedAt: endedAt } });
      await tx.auditLog.create({ data: { actor: deviceId, action: 'PATROL_SESSION_ENDED', entity: 'Shift', entityId: s.shiftId, details: { sessionId: s.id, deviceId } } });
    }
  });
}
/** Each acknowledgement commits both the immutable evidence and all related state. */
export async function recordPatrolScan(deviceId: string, input: unknown, now = new Date()) {
  const scan = scanSchema.parse(input);
  const payloadHash = qrHash(JSON.stringify(scan));
  return serial(async tx => {
    const previous = await tx.patrolEvent.findUnique({ where: { eventId: scan.eventId }, include: { session: true } });
    if (previous) {
      if (previous.session.deviceId !== deviceId || previous.payloadHash !== payloadHash) throw Error('Event ID conflict');
      return { eventId: scan.eventId, status: 'duplicate', decision: previous.decision };
    }
    const s = await tx.patrolSession.findFirst({ where: { id: scan.sessionId, deviceId }, include: { shift: { include: { guard: true } } } });
    if (!s) throw Error('Session not found');
    const a = await tx.patrolAssignment.findFirst({ where: { id: scan.assignmentId, sessionId: s.id }, include: { checkpoint: true } });
    if (!a) throw Error('Assignment not found');
    const captured = new Date(scan.capturedAt);
    let decision = scanDecision(scan, s, a, now);
    const gpsCapturedAt = scan.gpsCapturedAt ? new Date(scan.gpsCapturedAt) : null;
    if (decision === 'ACCEPTED' && (scan.gpsCapturedAt !== undefined || a.checkpoint.qrVersion >= 2)) {
      if (!gpsCapturedAt || !gpsTimeCorrelates(captured, gpsCapturedAt, now)) decision = 'GPS_TIME_UNCERTAIN';
      else if (gpsCapturedAt < s.startedAt || gpsCapturedAt >= s.expiresAt || (s.endedAt && gpsCapturedAt >= s.endedAt)) decision = 'SESSION_CLOSED';
    }
    let fence = { latitude: a.checkpoint.latitude, longitude: a.checkpoint.longitude, radiusM: a.checkpoint.radiusM };
    if (decision === 'ACCEPTED' && qrHash(scan.qr) === a.checkpoint.qrHash && a.checkpoint.qrVersion >= 2) {
      const signed = verifyCoordinateQr(scan.qr, a.checkpoint);
      if (!signed || signed.siteId !== s.shift.locationId) decision = 'INVALID_QR_COORDINATES';
      else fence = signed;
    }
    const gps = scan.latitude !== null && scan.longitude !== null && scan.accuracyM !== null ? classifyFix({ latitude: scan.latitude, longitude: scan.longitude, accuracyM: scan.accuracyM }, fence, 50) : null;
    if (decision === 'ACCEPTED') {
      if (qrHash(scan.qr) !== a.checkpoint.qrHash) decision = 'WRONG_QR';
      else if (scan.mock) decision = 'MOCK_LOCATION';
      else if (!gps || gps.state === 'UNKNOWN') decision = 'GPS_UNCERTAIN';
      else if (gps.state === 'OUTSIDE') decision = 'OUTSIDE_CHECKPOINT';
    }
    await tx.patrolEvent.create({ data: { eventId: scan.eventId, sessionId: s.id, assignmentId: a.id, payloadHash, decision, capturedAt: captured, gpsCapturedAt, latitude: scan.latitude, longitude: scan.longitude, accuracyM: scan.accuracyM, distanceM: gps?.distanceM, delayed: +now - +captured > 120000, receivedAt: now } });
    if (decision === 'ACCEPTED') {
      await tx.patrolAssignment.update({ where: { id: a.id }, data: { status: 'COMPLETED', completedAt: captured } });
      await tx.shiftCheckIn.create({ data: { shiftId: s.shiftId, guardId: s.shift.guardId, type: 'STATUS_UPDATE', source: 'APP', at: captured, note: `Patrol verified: ${a.checkpoint.name}${+now - +captured > 120000 ? ' · synced after outage' : ''}`, latitude: scan.latitude, longitude: scan.longitude } });
      // A checkpoint scan is patrol evidence, not a substitute for the attendance check-in policy.
    } else {
      await tx.notification.create({ data: { type: 'PATROL_EXCEPTION', severity: 'WARNING', title: 'Patrol scan needs review', body: `${a.checkpoint.name}: ${decision}`, guardId: s.shift.guardId, shiftId: s.shiftId } });
    }
    return { eventId: scan.eventId, status: 'ok', decision };
  });
}
export function scanDecision(scan: Scan, session: { startedAt: Date; expiresAt: Date; endedAt: Date | null; shift: { status: string; guard: { active: boolean; employmentStatus: string } } }, assignment: { dueAt: Date; expiresAt: Date; status: string }, now: Date): string {
  const at = Date.parse(scan.capturedAt);
  if (!Number.isFinite(at) || at > +now + 30000) return 'FUTURE_EVENT';
  if (at < +session.startedAt || at >= +session.expiresAt || (session.endedAt && at >= +session.endedAt)) return 'SESSION_CLOSED';
  if (session.shift.status === 'CANCELLED' || !session.shift.guard.active || session.shift.guard.employmentStatus !== 'ACTIVE') return 'SHIFT_UNAVAILABLE';
  if (at < +assignment.dueAt || at > +assignment.expiresAt) return 'OUTSIDE_WINDOW';
  if (assignment.status === 'COMPLETED') return 'ALREADY_COMPLETED';
  return 'ACCEPTED';
}
export async function expirePatrols(now = new Date()) {
  // Only windows during an active guard session can produce missed-patrol alerts.
  return serial(async tx => {
    const eligible = await tx.$queryRaw<{ id: string }[]>`SELECT a.id FROM "PatrolAssignment" a JOIN "PatrolSession" s ON s.id = a."sessionId" JOIN "Shift" sh ON sh.id = s."shiftId" WHERE a.status = 'PENDING' AND a."expiresAt" < ${now} AND (s."endedAt" IS NULL OR a."expiresAt" < s."endedAt") AND sh.status NOT IN ('CANCELLED', 'MISSED') ORDER BY a."expiresAt" LIMIT 200`;
    const missed = await tx.patrolAssignment.findMany({ where: { id: { in: eligible.map(a => a.id) } }, include: { session: { include: { shift: true } }, checkpoint: true }, take: 200 });
    let count = 0;
    for (const a of missed) {
      if (a.session.endedAt && a.expiresAt >= a.session.endedAt) continue;
      const changed = await tx.patrolAssignment.updateMany({ where: { id: a.id, status: 'PENDING' }, data: { status: 'MISSED', alertedAt: now } });
      if (!changed.count) continue;
      count++;
      await tx.notification.create({ data: { type: 'PATROL_MISSED', severity: 'WARNING', title: 'Missed patrol window', body: `${a.checkpoint.name} · awaiting device evidence; the handset may be offline`, guardId: a.session.shift.guardId, shiftId: a.session.shiftId } });
    }
    return count;
  });
}
