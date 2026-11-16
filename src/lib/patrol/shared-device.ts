import { DomainError } from "@/lib/security/api-errors";
/** Company-owned device identity is NOT a guard identity.
 * Repository functions must be transactional in a real deployment.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const MIN_PIN_LENGTH = 6;
export async function hashGuardPin(pin: string): Promise<string> {
  if (!/^\d{6,12}$/.test(pin)) throw new DomainError("PIN must be 6–12 digits");
  if (/^(.)\1+$/.test(pin) || "0123456789012".includes(pin) || "9876543210987".includes(pin))
    throw new DomainError("Choose a PIN without repeated or sequential digits");
  const salt = randomBytes(16);
  const hash = (await scrypt(pin, salt, 64)) as Buffer;
  return `scrypt-v1:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}
export async function verifyGuardPin(pin: string, stored: string): Promise<boolean> {
  if (!/^\d{6,12}$/.test(pin)) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt-v1") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = (await scrypt(pin, salt, 64)) as Buffer;
  return timingSafeEqual(expected, actual);
}
export const PIN_MIN_LENGTH = MIN_PIN_LENGTH;
