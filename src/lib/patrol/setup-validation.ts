import { z } from 'zod';
import { phoneSchema } from '@/lib/validation';
const base = { requestId: z.string().uuid() };
export const setupSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('site'), name: z.string().trim().min(2, 'Enter the site name').max(100), address: z.string().trim().min(2, 'Enter the site address').max(300), clientId: z.string().optional(), clientName: z.string().trim().max(100).optional(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), geofenceRadiusM: z.number().int().min(20).max(5000).default(150) }).refine(d => Boolean(d.clientId || (d.clientName && d.clientName.length >= 2)), 'Choose a client or enter a client name'),
  z.object({ ...base, kind: z.literal('guard'), firstName: z.string().trim().min(1, 'Enter the first name').max(80), lastName: z.string().trim().min(1, 'Enter the last name').max(80), phone: phoneSchema, nationalId: z.string().trim().min(3, 'Enter the national ID').max(80), gender: z.enum(['MALE', 'FEMALE', 'OTHER']).default('OTHER'), pin: z.string().regex(/^\d{6,12}$/, 'Choose a PIN with 6–12 digits'), locationId: z.string().min(1) }),
  z.object({ ...base, kind: z.literal('handset'), deviceName: z.string().trim().min(2, 'Enter a name for the phone').max(100), phoneNumber: phoneSchema, locationId: z.string().min(1) }),
  z.object({ ...base, kind: z.literal('shift'), guardId: z.string().min(1, 'Choose a guard'), locationId: z.string().min(1), startAt: z.string().datetime(), endAt: z.string().datetime() }).refine(d => Date.parse(d.endAt) > Date.parse(d.startAt) && Date.parse(d.endAt) - Date.parse(d.startAt) <= 86400000, 'Choose an end after the start, within 24 hours'),
]);
export type SetupInput = z.infer<typeof setupSchema>;
export function setupProgress(input: { site: boolean; checkpoints: number; patrolsEnabled: boolean; guardHasPin: boolean; phoneAssigned: boolean; phoneActivated: boolean; shiftScheduled: boolean }) {
  const completed = [input.site && input.checkpoints > 0 && input.patrolsEnabled, input.guardHasPin, input.phoneAssigned && input.phoneActivated, input.shiftScheduled];
  return { completed, nextStep: Math.max(0, completed.findIndex(c => !c)), ready: completed.every(Boolean) };
}
