/** Company-owned device identity is NOT a guard identity.
 * Repository functions must be transactional in a real deployment.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const MIN_PIN_LENGTH=6;
export async function hashGuardPin(pin: string): Promise<string> {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN must be 6–12 digits');
  const salt = randomBytes(16);
  const hash = await scrypt(pin,salt,64) as Buffer;
  return `scrypt-v1:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}
export async function verifyGuardPin(pin: string, stored: string): Promise<boolean> {
  if (!/^\d{6,12}$/.test(pin)) return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1') return false;
  const salt = Buffer.from(parts[1],'base64url');
  const expected = Buffer.from(parts[2],'base64url');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(pin,salt,64) as Buffer;
  return timingSafeEqual(expected,actual);
}
export type GuardDeviceSession = {
  sessionId: string; deviceId: string; guardId: string; siteId: string; shiftId: string;
  startedAtMs: number; expiresAtMs: number; endedAtMs: number|null;
  authMethod: 'ONLINE_PIN'|'OFFLINE_PIN';
};
export type SessionDecision = 'VALID'|'NO_SESSION'|'WRONG_DEVICE'|'WRONG_GUARD'|'WRONG_SHIFT'|'EXPIRED'|'ENDED'|'FUTURE_EVENT';
export function validateGuardSession(session: GuardDeviceSession|null, event: {
  deviceId: string; guardId: string; shiftId: string; capturedAtMs: number;
}): SessionDecision {
  if (!session) return 'NO_SESSION';
  if (event.deviceId !== session.deviceId) return 'WRONG_DEVICE';
  if (event.guardId !== session.guardId) return 'WRONG_GUARD';
  if (event.shiftId !== session.shiftId) return 'WRONG_SHIFT';
  if (event.capturedAtMs < session.startedAtMs) return 'FUTURE_EVENT';
  if (event.capturedAtMs > session.expiresAtMs) return 'EXPIRED';
  if (session.endedAtMs !== null && event.capturedAtMs > session.endedAtMs) return 'ENDED';
  return 'VALID';
}
/** Guard A cannot continue working under Guard B after a handover. Historic queued events retain A's ID. */
export function handoverSession(current: GuardDeviceSession|null, incoming: GuardDeviceSession, atMs: number): {
  outgoing: GuardDeviceSession|null; incoming: GuardDeviceSession;
} {
  if (incoming.startedAtMs !== atMs || incoming.expiresAtMs <= atMs) throw Error('Invalid incoming session');
  if (current && current.deviceId !== incoming.deviceId) throw Error('Handover requires the same company device');
  if (current && atMs < current.startedAtMs) throw Error('Handover before prior session start');
  return { outgoing: current ? {...current, endedAtMs: Math.min(atMs,current.endedAtMs??atMs)} : null, incoming };
}
/** Lockout policy must be persisted per guard AND per device, never held only in process memory. */
export function pinAttemptDecision(failedAttempts: number, lastFailureMs: number, nowMs: number): 'ALLOW'|'LOCKED' {
  if (failedAttempts < 5) return 'ALLOW';
  return nowMs - lastFailureMs >= 15*60000 ? 'ALLOW' : 'LOCKED';
}
export const PIN_MIN_LENGTH = MIN_PIN_LENGTH;
