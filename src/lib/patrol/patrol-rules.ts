/** Pure patrol planning rules. Deliberately no database or device dependencies. */
export type Checkpoint = { id: string; priority: number; minimumVisits: number; maxGapMinutes?: number };
export type PatrolPolicy = { minIntervalMinutes: number; maxIntervalMinutes: number; shiftEndMs: number; seed?: string };
export type PatrolVisit = { checkpointId: string; capturedAtMs: number; assignmentId: string };
export type PatrolAssignment = { id: string; checkpointId: string; dueAtMs: number; expiresAtMs: number };

export function validatePatrolPolicy(policy: PatrolPolicy, checkpoints: Checkpoint[]): void {
  if (!Number.isFinite(policy.minIntervalMinutes) || !Number.isFinite(policy.maxIntervalMinutes) ||
      policy.minIntervalMinutes < 1 || policy.maxIntervalMinutes > 240 ||
      policy.minIntervalMinutes > policy.maxIntervalMinutes) throw Error('Invalid patrol interval policy');
  if (!Number.isFinite(policy.shiftEndMs)) throw Error('Invalid shift end');
  if (!checkpoints.length || new Set(checkpoints.map(c => c.id)).size !== checkpoints.length) throw Error('Missing or repeated checkpoints');
  if (checkpoints.some(c => !c.id || !Number.isFinite(c.priority) || c.priority <= 0 ||
      !Number.isSafeInteger(c.minimumVisits) || c.minimumVisits < 0 ||
      (c.maxGapMinutes !== undefined && (!Number.isFinite(c.maxGapMinutes) || c.maxGapMinutes < 1)))) throw Error('Invalid checkpoint requirements');
}

/** Use crypto-secure random values on the Android client; don't use Math.random for a security-sensitive schedule. */
export function nextPatrolDue(nowMs: number, policy: PatrolPolicy, randomUint32: () => number): number | null {
  if (!Number.isFinite(nowMs)) throw Error('Invalid time');
  const span = Math.round((policy.maxIntervalMinutes - policy.minIntervalMinutes) * 60000);
  const lower = Math.round(policy.minIntervalMinutes * 60000);
  if (span < 0 || lower < 60000) throw Error('Invalid interval');
  const value = randomUint32();
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error('Random generator must return uint32');
  const delay = lower + Math.floor((value / 0x100000000) * (span + 1));
  const due = nowMs + delay;
  return due < policy.shiftEndMs ? due : null;
}

/** Prefer under-visited checkpoints and overdue high-priority ones, with random tie-breaking. */
export function selectCheckpoint(checkpoints: Checkpoint[], visits: PatrolVisit[], nowMs: number, randomUint32: () => number): Checkpoint {
  if (!checkpoints.length) throw Error('No checkpoints');
  const stats = checkpoints.map(checkpoint => {
    const history = visits.filter(v => v.checkpointId === checkpoint.id && v.capturedAtMs <= nowMs);
    const last = history.length ? Math.max(...history.map(v => v.capturedAtMs)) : null;
    const missing = Math.max(0, checkpoint.minimumVisits - history.length);
    const overdue = checkpoint.maxGapMinutes !== undefined && (last === null || nowMs - last >= checkpoint.maxGapMinutes * 60000);
    return { checkpoint, missing, overdue, last };
  });
  const maxMissing = Math.max(...stats.map(s => s.missing));
  let choices = maxMissing > 0 ? stats.filter(s => s.missing === maxMissing) : stats;
  if (choices.some(s => s.overdue)) choices = choices.filter(s => s.overdue);
  const bestPriority = Math.max(...choices.map(s => s.checkpoint.priority));
  choices = choices.filter(s => s.checkpoint.priority === bestPriority);
  // Tie-break with the supplied random function (same API for online/offline).
  const value = randomUint32();
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error('Random generator must return uint32');
  return choices[Math.floor((value / 0x100000000) * choices.length)].checkpoint;
}

export type ScanDecision = 'ACCEPTED' | 'DUPLICATE' | 'UNASSIGNED' | 'WRONG_CHECKPOINT' | 'OUTSIDE_WINDOW';
export function evaluatePatrolScan(assignment: PatrolAssignment, scan: {
  assignmentId: string; checkpointId: string; capturedAtMs: number; eventId: string;
}, seenEventIds: ReadonlySet<string>, assignedCheckpointIds: ReadonlySet<string>): ScanDecision {
  if (seenEventIds.has(scan.eventId)) return 'DUPLICATE';
  if (!assignedCheckpointIds.has(scan.checkpointId) || assignment.id !== scan.assignmentId) return 'UNASSIGNED';
  if (assignment.checkpointId !== scan.checkpointId) return 'WRONG_CHECKPOINT';
  if (scan.capturedAtMs < assignment.dueAtMs || scan.capturedAtMs > assignment.expiresAtMs) return 'OUTSIDE_WINDOW';
  return 'ACCEPTED';
}

/** A guard session is independent of the company-owned handset. */
export type GuardPatrolSession = {
  sessionId: string; deviceId: string; guardId: string; shiftId: string; siteId: string;
  startedAtMs: number; expiresAtMs: number; endedAtMs: number | null;
};
export function mayRecordScan(session: GuardPatrolSession, deviceId: string, shiftId: string, atMs: number): boolean {
  return session.deviceId === deviceId && session.shiftId === shiftId && session.startedAtMs <= atMs &&
    session.expiresAtMs >= atMs && (session.endedAtMs === null || atMs <= session.endedAtMs);
}
