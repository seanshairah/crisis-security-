import {
  nextPatrolDue,
  selectCheckpoint,
  validatePatrolPolicy,
  type Checkpoint,
  type PatrolVisit,
} from "./patrol-rules";
/** Pre-issued random windows survive outages. Missed windows don't count as visits. */
export function createPatrolPlan(
  startMs: number,
  endMs: number,
  policy: { minIntervalMinutes: number; maxIntervalMinutes: number; responseMinutes: number },
  checkpoints: Checkpoint[],
  random: () => number,
) {
  const p = { ...policy, shiftEndMs: endMs };
  validatePatrolPolicy(p, checkpoints);
  const planned: PatrolVisit[] = [];
  const result: { checkpointId: string; dueAt: Date; expiresAt: Date }[] = [];
  let cursor = startMs;
  while (result.length < 1500) {
    const due = nextPatrolDue(cursor, p, random);
    if (due === null) break;
    const checkpoint = selectCheckpoint(checkpoints, planned, due, random);
    const expires = Math.min(due + policy.responseMinutes * 60000, endMs);
    result.push({
      checkpointId: checkpoint.id,
      dueAt: new Date(due),
      expiresAt: new Date(expires),
    });
    planned.push({
      checkpointId: checkpoint.id,
      capturedAtMs: due,
      assignmentId: String(result.length),
    });
    cursor = expires;
  }
  return result;
}
