import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing shared by both directions of the inventory integration.
 *
 *   x-crisis-timestamp: <unix seconds>
 *   x-crisis-signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *
 * The timestamp is inside the signed text, so a captured request cannot be replayed outside the
 * tolerance window, and a body cannot be swapped under a valid signature.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signGateBody(secret: string, timestamp: number, body: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyGateSignature(
  secret: string,
  header: string | null | undefined,
  timestamp: string | null | undefined,
  body: string,
  nowMs = Date.now(),
): boolean {
  if (!header || !timestamp || !/^\d{9,12}$/.test(timestamp)) return false;
  const t = Number(timestamp);
  if (Math.abs(nowMs / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signGateBody(secret, t, body));
  const supplied = Buffer.from(header);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
