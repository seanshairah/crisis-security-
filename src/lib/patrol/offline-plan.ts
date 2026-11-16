/** Fully local patrol schedule generation. Persist the generated assignment before displaying it.
 * The backend reconciles events; a client-side timestamp alone is not proof of timely presence.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { nextPatrolDue, selectCheckpoint, type Checkpoint, type PatrolAssignment, type PatrolPolicy, type PatrolVisit } from './patrol-rules';
export const secureUint32 = (): number => randomBytes(4).readUInt32BE(0);
export type PatrolOfflineState = {
  deviceId: string; sessionId: string; guardId: string; shiftId: string; siteId: string;
  policyVersion: number; lastAssignment: PatrolAssignment|null;
  visits: PatrolVisit[];
};
export type GeneratedPatrol = PatrolAssignment & { sessionId: string; siteId: string; policyVersion: number; generatedOffline: boolean };
export function generateOfflineAssignment(state: PatrolOfflineState, checkpoints: Checkpoint[], policy: PatrolPolicy,
  nowMs: number, randomUint32: ()=>number = secureUint32,
  idFactory: ()=>string = randomUUID): GeneratedPatrol|null {
  if (state.policyVersion < 1 || !state.sessionId || !state.siteId || !state.shiftId) throw Error('Invalid offline patrol state');
  // A pending task must be resolved/expired explicitly, not silently replaced on each heartbeat.
  if (state.lastAssignment && nowMs <= state.lastAssignment.expiresAtMs) return null;
  const dueAtMs = nextPatrolDue(nowMs,policy,randomUint32);
  if (dueAtMs === null) return null;
  const checkpoint = selectCheckpoint(checkpoints,state.visits,nowMs,randomUint32);
  return { id:idFactory(),checkpointId:checkpoint.id,dueAtMs,
    expiresAtMs:Math.min(policy.shiftEndMs,dueAtMs+10*60000),
    sessionId:state.sessionId,siteId:state.siteId,policyVersion:state.policyVersion,generatedOffline:true };
}
export type OfflineScanEvent = {
  eventId: string; sessionId: string; deviceId: string; guardId: string; shiftId: string; siteId: string;
  assignmentId: string; checkpointId: string; credentialId: string;
  capturedAtMs: number; enqueuedAtMs: number; accuracyM: number|null;
};
/** Reconciliation guardrail: server persists eventId uniquely and validates sessions, QR credentials and assignments separately. */
export function classifyOfflineScan(event: OfflineScanEvent, nowMs: number, seenEventIds: ReadonlySet<string>):
  'DUPLICATE'|'INVALID'|'FUTURE_CLOCK'|'DELAYED'|'REVIEW' {
  if (seenEventIds.has(event.eventId)) return 'DUPLICATE';
  if ([event.eventId,event.sessionId,event.deviceId,event.guardId,event.shiftId,event.siteId,event.assignmentId,event.checkpointId,event.credentialId].some(v=>!v) ||
      !Number.isFinite(event.capturedAtMs) || !Number.isFinite(event.enqueuedAtMs) ||
      event.enqueuedAtMs < event.capturedAtMs ||
      (event.accuracyM !== null && (!Number.isFinite(event.accuracyM) || event.accuracyM < 0))) return 'INVALID';
  if (event.capturedAtMs > nowMs + 2*60000) return 'FUTURE_CLOCK';
  if (nowMs - event.capturedAtMs > 24*3600000) return 'REVIEW';
  return 'DELAYED'; // Retain actual evidence labels even for timely offline uploads.
}
