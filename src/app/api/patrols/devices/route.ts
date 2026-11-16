import { guarded, json } from '@/lib/api';
import { serial } from '@/lib/patrol/service';
import { z } from 'zod';
export const POST = guarded('ADMIN', async (req, _ctx, user) => {
  const { deviceId, locationId } = z.object({ deviceId: z.string().min(1), locationId: z.string().min(1) }).parse(await req.json());
  await serial(async tx => {
    await tx.location.findFirstOrThrow({ where: { id: locationId, active: true } });
    const device = await tx.gatewayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    if (device.guardId) throw Error('Unlink the individual guard before converting this company handset');
    if (['REVOKED', 'DISABLED'].includes(device.status)) throw Error('Device is disabled');
    if (await tx.patrolSession.count({ where: { deviceId, endedAt: null, expiresAt: { gt: new Date() } } })) throw Error('End the active guard session before moving the device');
    await tx.gatewayDevice.update({ where: { id: deviceId }, data: { sharedCompanyDevice: true, mode: 'GUARD', locationId } });
    await tx.auditLog.create({ data: { userId: user.id, actor: user.name, action: 'COMPANY_PATROL_DEVICE_ASSIGNED', entity: 'GatewayDevice', entityId: deviceId, details: { locationId } } });
  });
  return json({ ok: true });
});
