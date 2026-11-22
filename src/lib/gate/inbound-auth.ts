import { secretMatches } from "@/lib/security/secrets";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { DomainError } from "@/lib/security/api-errors";
import { inboundSites } from "./config";
import { verifyGateSignature } from "./signing";

/**
 * Authenticates a request from the inventory system. Order matters: throttle by source first (so
 * guessing tokens is bounded), then bearer, then the optional HMAC over the raw body, then a
 * per-connection budget. Returns the raw body so the caller parses exactly the signed bytes.
 */
export async function authenticateInbound(req: Request) {
  const ip = clientIp(req) ?? "unknown";
  if (!(await rateLimit(`gate:in-ip:${ip}`, 90, 60_000)).ok)
    throw new DomainError("Please retry shortly", 429);
  const key = process.env.GATE_INBOUND_TOKEN;
  if (
    !key ||
    key.length < 32 ||
    !secretMatches(key, req.headers.get("authorization")?.replace(/^Bearer /, ""))
  )
    throw new DomainError("Unauthorised", 401);
  const body = await req.text();
  if (Buffer.byteLength(body) > 100_000) throw new DomainError("Gate request is too large", 413);
  const secret = process.env.GATE_INBOUND_SIGNING_SECRET;
  if (
    secret &&
    !verifyGateSignature(
      secret,
      req.headers.get("x-crisis-signature"),
      req.headers.get("x-crisis-timestamp"),
      body,
    )
  )
    throw new DomainError("Unauthorised", 401);
  if (!(await rateLimit("gate:inbound", 240, 60_000)).ok)
    throw new DomainError("Please retry shortly", 429);
  return { body, sites: inboundSites() };
}
