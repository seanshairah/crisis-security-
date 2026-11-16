import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export type CoordinateCheckpoint = { id: string; locationId: string; latitude: number; longitude: number; radiusM: number };
export type CoordinateQr = { checkpointId: string; siteId: string; latitude: number; longitude: number; radiusM: number };
function key(secret?: string): string {
  const value = secret ?? process.env.PATROL_QR_SIGNING_SECRET ?? process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw Error('A checkpoint signing key of at least 32 characters is required');
  return value;
}
function signature(body: string, secret?: string): string { return createHmac('sha256', key(secret)).update('crisis-checkpoint-v2\n' + body).digest('base64url'); }
export function createCoordinateQr(c: CoordinateCheckpoint, secret?: string): string {
  if (!c.id || !c.locationId || /[|]/.test(c.id + c.locationId) || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180 || !Number.isInteger(c.radiusM) || c.radiusM < 10 || c.radiusM > 500) throw Error('Invalid checkpoint coordinates');
  const body = ['CS2', c.id, c.locationId, c.latitude.toFixed(6), c.longitude.toFixed(6), c.radiusM, randomBytes(16).toString('base64url')].join('|');
  return body + '|' + signature(body, secret);
}
export function verifyCoordinateQr(raw: string, expected: CoordinateCheckpoint, secret?: string): CoordinateQr | null {
  if (![expected.latitude, expected.longitude, expected.radiusM].every(Number.isFinite)) return null;
  const p = raw.split('|');
  if (p.length !== 8 || p[0] !== 'CS2' || p[1] !== expected.id || p[2] !== expected.locationId || !/^-?\d{1,3}\.\d{6}$/.test(p[3]) || !/^-?\d{1,3}\.\d{6}$/.test(p[4]) || !/^\d{2,3}$/.test(p[5]) || !/^[A-Za-z0-9_-]{22}$/.test(p[6]) || !/^[A-Za-z0-9_-]{43}$/.test(p[7])) return null;
  const body = p.slice(0,7).join('|'); const wanted = signature(body, secret); const given = Buffer.from(p[7]); const signed = Buffer.from(wanted);
  if (given.length !== signed.length || !timingSafeEqual(given, signed)) return null;
  const latitude = Number(p[3]), longitude = Number(p[4]), radiusM = Number(p[5]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || radiusM < 10 || radiusM > 500 || Math.abs(latitude - expected.latitude) > 0.00000051 || Math.abs(longitude - expected.longitude) > 0.00000051 || radiusM !== expected.radiusM) return null;
  return { checkpointId: p[1], siteId: p[2], latitude, longitude, radiusM };
}

// Legacy credential helpers retained for compatibility with earlier integrations.
/** Checkpoint QR credentials: static printed signs, authenticated and revocable on the server.
 * A signed code proves provenance only; a photo of a sign can still be replayed.
 */

export type CheckpointQrClaims = { version: 1; siteId: string; checkpointId: string; credentialId: string; issuedAt: number };
export type QrVerification = { ok: true; claims: CheckpointQrClaims } | { ok: false; reason: 'MALFORMED'|'INVALID_SIGNATURE'|'REVOKED'|'WRONG_SITE'|'UNKNOWN_CHECKPOINT' };
const b64 = (buf: Buffer) => buf.toString('base64url');
const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest();
function validateClaims(c: CheckpointQrClaims) {
  if (c.version !== 1 || !Number.isSafeInteger(c.issuedAt) || c.issuedAt <= 0 ||
    [c.siteId,c.checkpointId,c.credentialId].some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(v)))
    throw new Error('Invalid QR claims');
}
export function createCheckpointQr(claims: CheckpointQrClaims, signingKey: string): string {
  validateClaims(claims);
  if (signingKey.length < 32) throw new Error('Signing key too short');
  const payload = b64(Buffer.from(JSON.stringify(claims)));
  return `crisis-patrol:v1:${payload}.${b64(sign(payload, signingKey))}`;
}
export function verifyCheckpointQr(code: string, options: {
  signingKey: string; siteId: string; validCredentialIds: ReadonlySet<string>;
  checkpoints: ReadonlySet<string>;
}): QrVerification {
  if (code.length > 2048 || !code.startsWith('crisis-patrol:v1:')) return {ok:false,reason:'MALFORMED'};
  const token = code.slice('crisis-patrol:v1:'.length);
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return {ok:false,reason:'MALFORMED'};
  const expected = sign(parts[0], options.signingKey);
  const received = Buffer.from(parts[1], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received,expected)) return {ok:false,reason:'INVALID_SIGNATURE'};
  let claims: CheckpointQrClaims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); validateClaims(claims); }
  catch { return {ok:false,reason:'MALFORMED'}; }
  if (claims.siteId !== options.siteId) return {ok:false,reason:'WRONG_SITE'};
  if (!options.validCredentialIds.has(claims.credentialId)) return {ok:false,reason:'REVOKED'};
  if (!options.checkpoints.has(claims.checkpointId)) return {ok:false,reason:'UNKNOWN_CHECKPOINT'};
  return {ok:true,claims};
}
