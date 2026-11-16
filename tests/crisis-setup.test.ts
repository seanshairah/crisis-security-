import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupSchema, setupProgress } from '../src/lib/patrol/setup-validation';
import { randomUUID } from 'node:crypto';
test('readiness requires a checkpoint, enabled patrols, guard PIN, activated phone and shift', () => {
  const base = { site: true, checkpoints: 1, patrolsEnabled: true, guardHasPin: true, phoneAssigned: true, phoneActivated: true, shiftScheduled: true };
  assert.equal(setupProgress(base).ready, true);
  for (const key of ['site', 'patrolsEnabled', 'guardHasPin', 'phoneAssigned', 'phoneActivated', 'shiftScheduled'] as const) assert.equal(setupProgress({ ...base, [key]: false }).ready, false, key);
  assert.equal(setupProgress({ ...base, checkpoints: 0 }).ready, false);
  assert.equal(setupProgress({ ...base, phoneActivated: false }).nextStep, 2);
});
test('guided site setup needs a client and real coordinates', () => {
  const site = { requestId: randomUUID(), kind: 'site', name: 'North gate', address: 'Test road', latitude: -17.8, longitude: 31 };
  assert.equal(setupSchema.safeParse(site).success, false);
  assert.equal(setupSchema.safeParse({ ...site, clientName: 'Test client' }).success, true);
  assert.equal(setupSchema.safeParse({ ...site, clientName: 'Test client', latitude: 100 }).success, false);
});
test('guided shifts reject reversed or excessively long windows before writing', () => {
  const shift = { requestId: randomUUID(), kind: 'shift', guardId: 'g', locationId: 's', startAt: '2026-11-15T08:00:00.000Z', endAt: '2026-11-15T10:00:00.000Z' };
  assert.equal(setupSchema.safeParse(shift).success, true);
  assert.equal(setupSchema.safeParse({ ...shift, endAt: shift.startAt }).success, false);
  assert.equal(setupSchema.safeParse({ ...shift, endAt: '2026-11-17T08:00:00.000Z' }).success, false);
});
