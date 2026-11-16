import QRCode from 'qrcode';
import { guarded, json } from '@/lib/api';
import { db } from '@/lib/db';
import { serial, qrHash } from '@/lib/patrol/service';
import { createCoordinateQr } from '@/lib/patrol/checkpoint-qr';
export const GET = guarded('ADMIN', async (_req, ctx) => {
  const { id } = await ctx.params;
  const c = await db.patrolCheckpoint.findUniqueOrThrow({ where: { id } });
  if (!c.qrPayload || c.qrVersion < 2) throw Error('Upgrade this QR sign to include its checkpoint coordinates.');
  return json({ name: c.name, qrImage: await QRCode.toDataURL(c.qrPayload, { width: 1000, margin: 4, errorCorrectionLevel: 'M' }) });
});
export const POST = guarded('ADMIN', async (_req, ctx, user) => {
  const { id } = await ctx.params;
  const c = await serial(async tx => {
    const old = await tx.patrolCheckpoint.findFirstOrThrow({ where: { id, active: true } });
    const qrPayload = createCoordinateQr(old);
    const updated = await tx.patrolCheckpoint.update({ where: { id }, data: { qrPayload, qrHash: qrHash(qrPayload), qrVersion: 2 } });
    await tx.auditLog.create({ data: { userId: user.id, actor: user.name, action: 'CHECKPOINT_QR_REPLACED', entity: 'PatrolCheckpoint', entityId: id, details: { previousVersion: old.qrVersion, qrVersion: 2 } } });
    return updated;
  });
  return json({ name: c.name, qrImage: await QRCode.toDataURL(c.qrPayload!, { width: 1000, margin: 4, errorCorrectionLevel: 'M' }) });
});
