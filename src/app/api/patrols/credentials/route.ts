import { guarded, json } from '@/lib/api';
import { setPatrolPin } from '@/lib/patrol/service';
import { z } from 'zod';
export const POST = guarded('ADMIN', async (req, _ctx, user) => {
  const data = z.object({ guardId: z.string().min(1), pin: z.string().regex(/^\d{6,12}$/) }).parse(await req.json());
  await setPatrolPin(data.guardId, data.pin, user.id);
  return json({ ok: true });
});
