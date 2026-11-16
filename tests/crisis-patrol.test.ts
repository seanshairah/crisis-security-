import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePatrolScan, mayRecordScan, nextPatrolDue, selectCheckpoint, validatePatrolPolicy, type GuardPatrolSession } from '../src/lib/patrol/patrol-rules';
const checkpoints = [
  { id: 'gate', priority: 1, minimumVisits: 1 },
  { id: 'fence', priority: 2, minimumVisits: 1 },
  { id: 'bay', priority: 1, minimumVisits: 1 },
];
const now = Date.UTC(2026, 10, 13, 18);
const policy = { minIntervalMinutes: 10, maxIntervalMinutes: 35, shiftEndMs: now + 8 * 3600000 };
test('online and offline planners share bounded unpredictable windows', () => {
  validatePatrolPolicy(policy, checkpoints);
  assert.equal(nextPatrolDue(now, policy, () => 0), now + 10 * 60000);
  assert.equal(nextPatrolDue(now, policy, () => 0xffffffff), now + 35 * 60000);
  assert.equal(nextPatrolDue(now + 7 * 3600000 + 50 * 60000, policy, () => 0), null);
  assert.throws(() => validatePatrolPolicy({ ...policy, minIntervalMinutes: 40 }, checkpoints), /Invalid/);
});
test('coverage selection prefers checkpoints not yet visited, without repeating an already covered point', () => {
  assert.equal(selectCheckpoint(checkpoints, [], now, () => 0).id, 'fence');
  assert.equal(selectCheckpoint(checkpoints, [{checkpointId:'fence', capturedAtMs:now-5000,assignmentId:'a'}], now, () => 0).id, 'gate');
  assert.equal(selectCheckpoint(checkpoints, [{checkpointId:'fence', capturedAtMs:now-5000,assignmentId:'a'}, {checkpointId:'gate', capturedAtMs:now-5000,assignmentId:'b'}], now, () => 0).id, 'bay');
});
test('scans need the assigned checkpoint and assignment and are deduplicated', () => {
  const assignment = { id:'A', checkpointId:'gate', dueAtMs:now,expiresAtMs:now+600000 };
  const scan = { assignmentId:'A', checkpointId:'gate',eventId:'E1',capturedAtMs:now+30000 };
  assert.equal(evaluatePatrolScan(assignment,scan,new Set(),new Set(['gate'])),'ACCEPTED');
  assert.equal(evaluatePatrolScan(assignment,scan,new Set(['E1']),new Set(['gate'])),'DUPLICATE');
  assert.equal(evaluatePatrolScan(assignment,{...scan,checkpointId:'fence'},new Set(),new Set(['gate','fence'])),'WRONG_CHECKPOINT');
  assert.equal(evaluatePatrolScan(assignment,{...scan,capturedAtMs:now-10},new Set(),new Set(['gate'])),'OUTSIDE_WINDOW');
});
test('company phone events are bound to the signed-in guard session and shift', () => {
  const a: GuardPatrolSession = { sessionId:'s',deviceId:'company-phone-1',guardId:'guard-a',shiftId:'shift-1',siteId:'site',startedAtMs:now,expiresAtMs:now+3600000,endedAtMs:now+1800000 };
  assert.equal(mayRecordScan(a,'company-phone-1','shift-1',now+15000),true);
  assert.equal(mayRecordScan(a,'company-phone-1','shift-2',now+15000),false);
  assert.equal(mayRecordScan(a,'company-phone-1','shift-1',now+1800001),false);
});
