import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { setupSchema } from './setup-validation';
import { serial } from './service';
import { hashGuardPin, verifyGuardPin } from './shared-device';
import { generateActivationCode } from '@/lib/gateway/auth';

/** Guided setup writes the same site, guard, shift and handset records as the rest of Crisis. */
export async function saveSetup(input: unknown, actor: { id: string; name: string }) {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) throw Error(parsed.error.issues[0]?.message ?? 'Check the form');
  const d = parsed.data;
  const identity = { ...d } as Record<string, unknown>; delete identity.pin;
  const fingerprint = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const pinHash = d.kind === 'guard' ? await hashGuardPin(d.pin) : null;
  return serial(async tx => {
    const previous = await tx.auditLog.findUnique({ where: { id: `setup:${d.requestId}` } });
    if (previous) {
      const details = previous.details as { fingerprint: string; result: Prisma.JsonObject };
      if (details.fingerprint !== fingerprint || previous.userId !== actor.id) throw Error('This submission has already been used. Refresh the page and try again.');
      if (d.kind === 'guard') {
        const credential = await tx.patrolCredential.findUniqueOrThrow({ where: { guardId: String(details.result.id) } });
        if (!await verifyGuardPin(d.pin, credential.pinHash)) throw Error('This guard was already created with a different PIN. Use Change PIN to update it.');
      }
      return details.result;
    }
    let result: Prisma.JsonObject;
    let entity: string; let action: string;
    if (d.kind === 'site') {
      const client = d.clientId ? await tx.client.findFirstOrThrow({ where: { id: d.clientId, active: true } }) : await tx.client.create({ data: { code: `C-${d.requestId.slice(0, 8).toUpperCase()}`, name: d.clientName! } });
      const site = await tx.location.create({ data: { code: `S-${d.requestId.slice(0, 8).toUpperCase()}`, name: d.name, address: d.address, clientId: client.id, latitude: d.latitude, longitude: d.longitude, geofenceRadiusM: d.geofenceRadiusM, coordinatesSource: 'MANUAL', coordinatesUpdatedAt: new Date() } });
      result = { id: site.id, name: site.name }; entity = 'Location'; action = 'LOCATION_CREATED';
    } else {
      const site = await tx.location.findFirstOrThrow({ where: { id: d.locationId, active: true } });
      if (d.kind === 'guard') {
        // Stable unique number and database constraints prevent a double submission making two guards.
        const guard = await tx.guard.create({ data: { guardNo: `G-${d.requestId.slice(0, 8).toUpperCase()}`, firstName: d.firstName, lastName: d.lastName, phone: d.phone, nationalId: d.nationalId, gender: d.gender, homeLocationId: site.id, preferredAttendance: 'APP', phoneType: 'UNKNOWN', patrolCredential: { create: { pinHash: pinHash! } } } });
        result = { id: guard.id, guardNo: guard.guardNo }; entity = 'Guard'; action = 'GUARD_CREATED';
      } else if (d.kind === 'handset') {
        const device = await tx.gatewayDevice.create({ data: { deviceName: d.deviceName, phoneNumber: d.phoneNumber, mode: 'GUARD', sharedCompanyDevice: true, locationId: site.id, activationCode: generateActivationCode(), activationExpiresAt: new Date(Date.now() + 86400000) } });
        result = { id: device.id, activationCode: device.activationCode, activationExpiresAt: device.activationExpiresAt?.toISOString() ?? null }; entity = 'GatewayDevice'; action = 'GATEWAY_CREATED';
      } else {
        await tx.$queryRaw`SELECT id FROM "Guard" WHERE id = ${d.guardId} FOR UPDATE`;
        const guard = await tx.guard.findFirstOrThrow({ where: { id: d.guardId, active: true, employmentStatus: 'ACTIVE', patrolCredential: { isNot: null } } });
        const policy = await tx.patrolPolicy.findUnique({ where: { locationId: site.id } });
        if (!policy?.enabled || !await tx.patrolCheckpoint.count({ where: { locationId: site.id, active: true } })) throw Error('Add a checkpoint and enable patrols before scheduling this patrol shift.');
        const startAt = new Date(d.startAt), endAt = new Date(d.endAt);
        if (endAt <= new Date()) throw Error('The shift must end in the future.');
        if (await tx.shift.count({ where: { guardId: guard.id, status: { not: 'CANCELLED' }, startAt: { lt: endAt }, endAt: { gt: startAt } } })) throw Error('This guard already has an overlapping shift. Choose different times or use the existing shift.');
        const shift = await tx.shift.create({ data: { guardId: guard.id, locationId: site.id, startAt, endAt, durationMinutes: Math.round((+endAt - +startAt) / 60000), attendance: { create: {} } } });
        result = { id: shift.id, guardNo: guard.guardNo }; entity = 'Shift'; action = 'SHIFT_CREATED';
      }
    }
    await tx.auditLog.create({ data: { id: `setup:${d.requestId}`, userId: actor.id, actor: actor.name, action, entity, entityId: String(result.id), details: { via: 'guided-setup', fingerprint, result } } });
    return result;
  });
}
