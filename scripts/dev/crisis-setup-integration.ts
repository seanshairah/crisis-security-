import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const u = new URL(process.env.DATABASE_URL ?? 'http://missing');
if (!['localhost', '127.0.0.1'].includes(u.hostname) || u.port !== '55439' || u.pathname !== '/crisis_test') throw Error('Use only the disposable Crisis verification database');
async function main() {
  const { db } = await import('../../src/lib/db');
  const { saveSetup } = await import('../../src/lib/patrol/setup-service');
  const { verifyGuardPin } = await import('../../src/lib/patrol/shared-device');
  const tag = randomUUID();
  try {
    const user = await db.user.create({ data: { name: 'Setup verifier', email: `${tag}@test.invalid`, role: 'ADMIN', passwordHash: 'unused' } });
    const siteInput = { requestId: randomUUID(), kind: 'site', name: `Guided ${tag}`, clientName: 'Verification client', address: 'Verification only', latitude: -17.8, longitude: 31 };
    const sites = await Promise.all([saveSetup(siteInput, user), saveSetup(siteInput, user)]);
    assert.equal(sites[0].id, sites[1].id);
    assert.equal(await db.location.count({ where: { name: siteInput.name } }), 1);
    await assert.rejects(saveSetup({ ...siteInput, name: 'Changed after retry' }, user), /already been used/);
    const siteId = String(sites[0].id);
    const guardInput = { requestId: randomUUID(), kind: 'guard', firstName: 'Test', lastName: 'Guard', phone: `+26377${Date.now().toString().slice(-7)}`, nationalId: `TEST-${tag}`, locationId: siteId, pin: '654321' };
    const guard = await saveSetup(guardInput, user);
    assert.equal((await saveSetup(guardInput, user)).id, guard.id);
    const credential = await db.patrolCredential.findUniqueOrThrow({ where: { guardId: String(guard.id) } });
    assert.equal(await verifyGuardPin(guardInput.pin, credential.pinHash), true);
    const audit = await db.auditLog.findUniqueOrThrow({ where: { id: `setup:${guardInput.requestId}` } });
    assert.ok(!JSON.stringify(audit.details).includes(guardInput.pin));
    await assert.rejects(saveSetup({ ...guardInput, pin: '123456' }, user), /different PIN/);
    const phoneInput = { requestId: randomUUID(), kind: 'handset', deviceName: 'Guided company phone', phoneNumber: '+263772100123', locationId: siteId };
    const phones = await Promise.all([saveSetup(phoneInput, user), saveSetup(phoneInput, user)]);
    assert.equal(phones[0].id, phones[1].id); assert.ok(phones[0].activationCode);
    const device = await db.gatewayDevice.findUniqueOrThrow({ where: { id: String(phones[0].id) } });
    assert.equal(device.sharedCompanyDevice, true); assert.equal(device.guardId, null); assert.equal(device.locationId, siteId);
    const shiftInput = { requestId: randomUUID(), kind: 'shift', guardId: guard.id, locationId: siteId, startAt: new Date(Date.now() - 60000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() };
    await assert.rejects(saveSetup(shiftInput, user), /checkpoint/);
    await db.patrolCheckpoint.create({ data: { name: 'Gate', locationId: siteId, qrHash: tag, latitude: -17.8, longitude: 31 } });
    await db.patrolPolicy.create({ data: { locationId: siteId, enabled: true } });
    const shifts = await Promise.all([saveSetup(shiftInput, user), saveSetup(shiftInput, user)]);
    assert.equal(shifts[0].id, shifts[1].id);
    await assert.rejects(saveSetup({ ...shiftInput, requestId: randomUUID() }, user), /overlapping/);
    assert.equal(await db.shift.count({ where: { guardId: String(guard.id) } }), 1);
    assert.equal(await db.attendance.count({ where: { shiftId: String(shifts[0].id) } }), 1);
    console.log('PASS: guided client/site, guard/PIN, company handset and shift setup; retries create no duplicate records, PINs remain hashed and conflicting shifts are blocked.');
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
