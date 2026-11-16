/** Checkpoint coverage calculations are evidence summaries, not physical movement proofs. */
export type CheckpointRequirement = {
  id: string;
  minimumVisits: number;
  /** Maximum permissible minutes since last visit, if configured. */
  maxGapMinutes?: number;
};
export type EvidenceVisit = {
  checkpointId: string;
  occurredAtMs: number;
  result: 'ACCEPTED'|'PENDING'|'REJECTED';
};
export type CheckpointCoverage = {
  checkpointId: string;
  acceptedVisits: number;
  pendingVisits: number;
  missingVisits: number;
  lastAcceptedAtMs: number|null;
  state: 'COVERED'|'BEHIND'|'STALE'|'AWAITING_REVIEW';
};
/** Do not count pending/offline scans as confirmed visits until the server verifies them. */
export function calculateCoverage(points: readonly CheckpointRequirement[], visits: readonly EvidenceVisit[], nowMs: number): CheckpointCoverage[] {
  if (!Number.isFinite(nowMs)) throw Error('Invalid assessment time');
  if (new Set(points.map(p=>p.id)).size !== points.length || points.some(p=>
    !p.id || !Number.isSafeInteger(p.minimumVisits) || p.minimumVisits < 0 ||
    (p.maxGapMinutes !== undefined && (!Number.isFinite(p.maxGapMinutes) || p.maxGapMinutes <= 0)))) {
    throw Error('Invalid checkpoint coverage policy');
  }
  return points.map(point => {
    const eligible = visits.filter(v=> v.checkpointId === point.id && Number.isFinite(v.occurredAtMs) && v.occurredAtMs <= nowMs);
    const accepted = eligible.filter(v=> v.result === 'ACCEPTED');
    const pending = eligible.filter(v=> v.result === 'PENDING');
    const last = accepted.length ? Math.max(...accepted.map(v=>v.occurredAtMs)) : null;
    const missing = Math.max(0,point.minimumVisits-accepted.length);
    const stale = point.maxGapMinutes !== undefined && (last === null || nowMs-last > point.maxGapMinutes*60000);
    const state = missing > 0 ? (pending.length ? 'AWAITING_REVIEW' : 'BEHIND') : stale ? 'STALE' : 'COVERED';
    return {checkpointId:point.id,acceptedVisits:accepted.length,pendingVisits:pending.length,missingVisits:missing,lastAcceptedAtMs:last,state};
  });
}
