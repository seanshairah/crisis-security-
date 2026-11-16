/**
 * Gateway device authentication.
 *
 * A device is created in the portal with a short activation code. The phone exchanges the
 * code once for a long random token; only the SHA-256 hash of the token is stored. Every
 * later request carries `Authorization: Bearer <token>`. Revoking or disabling a device
 * makes its token useless immediately because every request re-reads the device row.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { GatewayDevice } from "@prisma/client";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

export function generateActivationCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function generateDeviceToken(): string {
  return "gw_" + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type GatewayAuthResult = { device: GatewayDevice; error?: undefined } | { device?: undefined; error: string; status: 401 | 403 };

/** Resolve the device behind a request. Rejects revoked and disabled devices. */
export async function authenticateGateway(req: Request): Promise<GatewayAuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "Missing device token", status: 401 };
  const device = await db.gatewayDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device || device.activationStatus !== "ACTIVE") return { error: "Unknown or inactive device token", status: 401 };
  if (device.status === "REVOKED") return { error: "This gateway has been revoked", status: 403 };
  if (device.status === "DISABLED") return { error: "This gateway is disabled", status: 403 };
  return { device };
}

export { clientIp } from "@/lib/security/client-ip";
export { rateLimit } from "@/lib/security/rate-limit";
